const OLLAMA_URL = "http://localhost:11434/api/generate";
const DEFAULT_MODEL = "gemma3:1b";
const MENU_SETTINGS_ID = "bridger-menu";
const MENU_TOGGLE_VIEW_ID = "bridger-toggle-view";
const MENU_AUTO_SIMPLIFY_ID = "bridger-auto-simplify";
const MENU_SIMPLIFY_ID = "bridger-simplify";

// Local BRIDGER Engine Cache
const SLM_MODULES = {};
const SLM_FILES = ['latn', 'deva', 'guru', 'taml', 'mlym', 'knda', 'beng', 'orya', 'telu', 'jpan', 'hani', 'mtei'];

async function loadLocalModules() {
  for (const mod of SLM_FILES) {
    try {
      const url = chrome.runtime.getURL(`src/${mod}_module.json`);
      const res = await fetch(url);
      if (res.ok) {
        SLM_MODULES[mod] = await res.json();
      }
    } catch (e) {
      console.warn(`Bridger SLM: Could not load ${mod} - ${e.message}`);
    }
  }
}
loadLocalModules();

// Fast SLM script detector
function detectScript(word) {
  if (/[\u0900-\u097F]/.test(word)) return 'deva';
  if (/[\u0980-\u09FF]/.test(word)) return 'beng';
  if (/[\u0A00-\u0A7F]/.test(word)) return 'guru';
  if (/[\u0B00-\u0B7F]/.test(word)) return 'orya';
  if (/[\u0B80-\u0BFF]/.test(word)) return 'taml';
  if (/[\u0C00-\u0C7F]/.test(word)) return 'telu';
  if (/[\u0C80-\u0CFF]/.test(word)) return 'knda';
  if (/[\u0D00-\u0D7F]/.test(word)) return 'mlym';
  if (/[\uABC0-\uABFF]/.test(word)) return 'mtei';
  if (/[\u3040-\u30FF]/.test(word)) return 'jpan';
  if (/[\u4E00-\u9FAF]/.test(word)) return 'hani';
  if (/[a-zA-Z\u00C0-\u017F]/.test(word)) return 'latn';
  return null;
}

// Local SLM replacement mapping matching existing extension styles
function processWordLocally(word) {
  // basic stripping matching python pipeline
  const cleanWord = word.replace(/[^\w\u0900-\u9FAF]/g, '');
  if (!cleanWord) return word;
  
  const script = detectScript(cleanWord);
  if (!script || !SLM_MODULES[script]) return word;
  
  const mod = SLM_MODULES[script];
  const wLower = cleanWord.toLowerCase();
  
  if (script === 'latn' && mod.common_pairs && mod.common_pairs[wLower]) {
     return word.replace(cleanWord, `[COLOR:teal]${mod.common_pairs[wLower]}[/COLOR]`);
  }
  
  let temp = word;
  let changed = false;

  // Generic Circular / Visual Confusion formatting
  const confusions = mod.visual_confusion || mod.kannada_confusions || mod.confusion_triplets || mod.circular_overlaps || mod.naveen_groups || [];
  for (const confArray of confusions) {
     for (const char of confArray) {
        // Simple replace avoiding double-wrapping logic issues by isolating specific hits
        if (temp.includes(char) && !temp.includes(`[COLOR`)) {
           temp = temp.replaceAll(char, `[COLOR:rose]${char}[/COLOR]`);
           changed = true;
        }
     }
  }

  // Highlight complex loops/ottus
  const complex = mod.complex_ottu || mod.difficult_vattulu || mod.juktakkhors || mod.phala_triggers || mod.difficult_ottulu || mod.complex_conjuncts || [];
  for (const comp of complex) {
     if (temp.includes(comp) && !temp.includes(`[COLOR`)) {
        temp = temp.replaceAll(comp, `[COLOR:sky]${comp}[/COLOR]`);
        changed = true;
     }
  }

  if (script === 'hani' && mod.decompositions) {
     let haniTemp = "";
     let haniChanged = false;
     for (const char of word) {
        if (mod.decompositions[char]) {
           haniTemp += `[KEY:${mod.decompositions[char]}][COLOR:gold]${char}[/COLOR]`;
           haniChanged = true;
        } else {
           haniTemp += char;
        }
     }
     if (haniChanged) return haniTemp;
  }
  
  if (changed) return temp;
  return word;
}

function runLocalSLM(text) {
  // Better Unicode-aware word splitting isolating punctuation correctly!
  const regex = /([\w\u0900-\u9FAF]+|[\s]+|[^\w\s\u0900-\u9FAF]+)/g;
  const tokens = text.match(regex) || [text];
  let changedAny = false;
  
  const processed = tokens.map(token => {
     if (!token.trim() || token.match(/^[^\w\u0900-\u9FAF]+$/)) return token; // Skip spaces and pure punctuation
     const newWord = processWordLocally(token);
     if (newWord !== token) changedAny = true;
     return newWord;
  });
  
  return { modifiedText: processed.join(""), hitLocalRules: changedAny };
}

function buildPrompt(text) {
  return [
    "You are Bridger, a text accessibility assistant for dyslexia and ADHD.",
    "Rewrite the text to be easier to read while preserving meaning and tone.",
    "Be concise. Do not add new ideas or expand the text.",
    "Keep the output length within +/- 15% of the input length.",
    "Keep the number of sentences the same or fewer than the input.",
    "Use short sentences (max 15 words) and one to two ideas per sentence.",
    "Use shorter, dyslexic-friendly words when possible.",
    "Split dense paragraphs into bullet points when helpful.",
    "Remove generic filler or self-evident statements.",
    "Only include points explicitly present in the source text.",
    "Do not dumb content down, assume your reader can process complex ideas.",
    "Do NOT simplify if the text is already easy to read (e.g. below 7th grade level).",
    "Do not affect technical accuracy or remove important details, but rephrase complex sentences for clarity.",
    "Do not repeat information already stated.",
    "Do not infer missing context.",
    "If you cannot simplify without adding information, return the original text unchanged.",
    "Avoid analysis, commentary, or prefaces.",
    "Return only the rewritten text with no special markers.",
    "Text:",
    text
  ].join("\n");
}

function tokenizeForOverlap(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function shouldFallbackToOriginal(inputText, outputText) {
  const inputTokens = tokenizeForOverlap(inputText);
  const outputTokens = tokenizeForOverlap(outputText);

  if (outputTokens.length === 0) return true;

  const inputSet = new Set(inputTokens);
  const overlapCount = outputTokens.filter((token) => inputSet.has(token)).length;
  const overlapRatio = overlapCount / outputTokens.length;

  const lengthRatio = outputText.length / Math.max(1, inputText.length);

  return overlapRatio < 0.4 || lengthRatio > 1.2;
}

async function callOllama(text, model) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: buildPrompt(text),
        stream: false,
        options: {
          temperature: 0.2,
          top_p: 0.9,
          repeat_penalty: 1.1
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Ollama error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    return data.response || "";
  } finally {
    clearTimeout(timeoutId);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "ollama_transform") {
    return false;
  }

  (async () => {
    try {
      const stored = await chrome.storage.local.get({ model: DEFAULT_MODEL });
      const model = stored.model || DEFAULT_MODEL;
      const text = String(message.text || "");
      
      let finalText = text;
      const slmResult = runLocalSLM(text);
      
      if (slmResult.hitLocalRules) {
         // Local SLM natively hit, bypassing generative Ollama rewrite for stability
         finalText = slmResult.modifiedText;
      } else {
         // Fallback to intensive generative rewrite
         const output = await callOllama(text, model);
         finalText = shouldFallbackToOriginal(text, output) ? text : output;
      }
      
      sendResponse({ ok: true, text: finalText });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || "Ollama unavailable" });
    }
  })();

  return true;
});

async function updateContextMenuState() {
  const stored = await chrome.storage.local.get({ autoSimplify: true });
  const autoSimplify = Boolean(stored.autoSimplify);

  chrome.contextMenus.update(MENU_AUTO_SIMPLIFY_ID, { checked: autoSimplify });
  chrome.contextMenus.update(MENU_SIMPLIFY_ID, { visible: !autoSimplify });
}

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {

    chrome.contextMenus.create({
      id: MENU_SIMPLIFY_ID,
      title: "Simplify",
      contexts: ["selection"]
    });

    chrome.contextMenus.create({
      id: MENU_SETTINGS_ID,
      title: "Bridger Settings",
      contexts: ["selection", "page"]
    });

    chrome.contextMenus.create({
      id: MENU_TOGGLE_VIEW_ID,
      parentId: MENU_SETTINGS_ID,
      title: "Toggle view",
      contexts: ["selection", "page"]
    });

    chrome.contextMenus.create({
      id: MENU_AUTO_SIMPLIFY_ID,
      parentId: MENU_SETTINGS_ID,
      title: "Auto-simplify selection",
      type: "checkbox",
      contexts: ["selection", "page"]
    });

    

    updateContextMenuState();
  });
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.autoSimplify) {
    updateContextMenuState();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === MENU_TOGGLE_VIEW_ID) {
    chrome.tabs.sendMessage(tab.id, { type: "toggle_view" });
    return;
  }

  if (info.menuItemId === MENU_SIMPLIFY_ID) {
    chrome.tabs.sendMessage(tab.id, { type: "simplify_selection" });
    return;
  }

  if (info.menuItemId === MENU_AUTO_SIMPLIFY_ID) {
    const checked = Boolean(info.checked);
    await chrome.storage.local.set({ autoSimplify: checked });
  }
});
