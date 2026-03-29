# Bridger

Local LLM-powered reading assistant browser extension for dyslexia/ADHD users. Project for EPICS.

## Overview & Supported Languages

Bridger utilizes a hybrid-compute pipeline seamlessly merging a fast `<O(1)` local JSON ruleset with an Ollama Generative Backend to parse visual and phonetic dyslexia confusions natively in the browser. 

We currently support structural adjustments for the following scripts and languages out of the box:

- **Middle East (RTL)**: Arabic, Urdu
- **European (Latin)**: English, French, German, Spanish
- **Deccan & Eastern**: Bengali (Bangla & Assamese), Odia, Telugu, Meitei Mayek (Manipuri)
- **Dravidian**: Tamil, Malayalam, Kannada
- **North Indian**: Devanagari (Hindi, Marathi, Gujarati) & Gurmukhi (Punjabi)
- **East Asian**: Japanese (Kana/Kanji) & Chinese (Hanzi Radicals)

## MVP

- Simplified text with reading aids
- Ollama API integration
- Font-safe styling
- Toggle between original/transformed text
- Popup controls

## Quick Start

1. Run Ollama locally and ensure the model exists (default: gemma3:1b due to speed, but you can switch to any you have)
2. Load the extension in browser
3. Select text on a page to transform it
4. Configure to liking with popup

## Notes

- Processing is local and privacy-first
- The extension does not override fonts
- We encourage using this alongside the OpenDyslexic extension
