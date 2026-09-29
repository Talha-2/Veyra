---
title: Voice and languages
description: Choose the languages your agent speaks and the voice customers hear, and understand what each language supports.
---

Two pages decide how the agent sounds. **Studio → Identity → Languages** sets which languages the agent speaks. **Studio → Voice** sets the voice and the speed tier. Both apply to voice sessions; languages also apply to chat.

## Languages

Open **Studio → Identity** and scroll to **Languages**. Tick each language the agent should speak. One language is the **Primary** one; to change it, tick another language and press **Make primary** on its row. Press **Save changes** when you are done.

The languages are not served equally, and the table says so before your first call does:

| Language | Mixed speech | Fast voice | Semantic turns |
| --- | --- | --- | --- |
| English | Yes | Yes | Yes |
| Spanish | Yes | Yes | Yes |
| French | Yes | Yes | Yes |
| German | Yes | Yes | Yes |
| Portuguese | Yes | Yes | Yes |
| Hindi | Yes | Yes | Yes |
| Arabic | Yes | Yes | No |
| Urdu | No | No | No |

What the columns mean (also under **What the columns mean** on the page):

- **Mixed speech**: the agent understands callers who switch languages mid-sentence, as people often do with numbers and names.
- **Fast voice**: the language is spoken on the realtime, low-latency voice tier. Without it, a slower engine is used.
- **Semantic turns**: the agent waits for the end of a thought, not only for silence, before it replies. Without it, the agent waits for silence (at least 700 ms) and is told to pause a beat before answering.

### Urdu

When you tick Urdu, the page shows its limits:

- Speech recognition is Urdu-only. Callers who switch into English mid-sentence, for example for numbers, dates and names, are understood less reliably. If a caller speaks another language, the agent politely asks them, in Urdu, to continue in Urdu.
- Urdu uses a different voice engine from the other languages, so the voice you pick on the Voice page does not apply to it.

### Which language a conversation uses

- A voice session in **Talk** runs in the agent's primary language. If the caller switches to another language you ticked, the agent is told to switch with them and stay there.
- In chat, the agent writes in the primary language and switches when the customer writes in another language you ticked.

## Voice

**Studio → Voice** shows what callers hear. The header says how many voice engines are live and which speed tier is selected.

### Choose a voice

1. Open **Studio → Voice**.
2. Under **Voices**, press the play button on a voice to hear it. The preview is a real line in the agent's primary language, from the engine that would say it on a call. If the voice does not speak the primary language, it plays in the voice's own language.
3. Select the voice you want. It moves to **Current voice** with the badge **Not saved yet**.
4. Press **Save changes**.

To narrow the list, use the language filter (**Agent's languages**, **Every language**, or one language), **Search voices**, and, when more than one engine is live, the engine filter (**All engines** or one engine). The list shows 12 voices at a time; use the buttons under the list to show more, or all of them.

Each voice card shows its gender, accent, style and languages. Voices your account created or cloned at the provider carry the badge **Yours**. A voice that cannot speak one of the agent's languages shows a warning, for example "Cannot speak Urdu". Voices that speak none of the agent's languages are dimmed.

If a saved voice is later removed at the provider, the page says **Saved voice is no longer offered**. Pick another and save.

### Voice engines

Veyra uses two voice engines:

- **Cartesia Sonic**: English, French, German, Spanish, Portuguese, Chinese, Japanese, Hindi, Italian, Korean, Dutch, Polish, Russian, Swedish and Turkish.
- **ElevenLabs**: English, Spanish, French, German, Portuguese, Hindi and Arabic.

Open **Engines** at the bottom of the page to see which engines are reachable. Each shows **Live**, **No key**, or the error it returned, for example "The API key was rejected."

If no engine is reachable, the page shows **Previews are off** and an illustrative list of voices. Those voices cannot be previewed, and they are not used in conversations.

### The default voice

- If you never choose a voice, the agent speaks with Cartesia's default voice.
- If the engine is ElevenLabs but no voice is set, ElevenLabs' default voice is used.

### When a language needs another engine

If your chosen engine cannot speak the language of a conversation, the agent uses another engine for that conversation, and your chosen voice does not apply. For example, Cartesia does not speak Arabic or Urdu. The **Speed tier** section warns you when one of the agent's languages cannot use the fast tier.

### Speed tier

How quickly the first sound reaches the caller. The figures are the vendors' published numbers, not Veyra's measurements.

| Tier | Time to first sound | Notes |
| --- | --- | --- |
| **Flash** (Recommended) | ~90 ms | The realtime tier. Use this unless a language rules it out. |
| **Turbo** | ~300 ms | Balanced. Noticeably slower on a call. |
| **Expressive** | ~1,200 ms | Highest fidelity, not realtime. |

The tier changes the model only on ElevenLabs. On Cartesia, every tier uses the same Sonic model.

> [!TIP]
> After you change the voice or languages, open [Talk](/docs/studio/talk) and press the voice button to hear the agent in a real session.

## Related

- [Identity and greeting](/docs/studio/identity)
- [Talk: test your agent](/docs/studio/talk)
