# What the film shows

[Uncart, in 60 seconds](Uncart-60s.mp4). This is the **main project demo**, not an entry in the separate five-gift TPS bounty.

| On screen | What it means |
| --- | --- |
| Camera link and ownership question | The Uncart interface is replayed for legibility. The example uses an [IPEVO V4K](https://us.ipevo.com/pages/v4k) as the contemplated purchase. |
| “Use your iPhone’s Desk View in FaceTime” | This was the recommendation returned to the maker by standard OpenClaw with Kimi K3.1 Pro on Cerebras. The film reproduces the answer, not the model’s runtime. |
| Two Apple citations | [Desk View](https://support.apple.com/en-us/121541) was read in that run. [Continuity Camera](https://support.apple.com/en-us/102546) was a saved source note, not a second fresh read. |
| Notebook | The maker confirmed the page was visible on the Mac after trying Desk View. The notebook graphic is an illustration, not footage of the maker or a call. |
| Cerebras vs. Fireworks | External context only. TokenDyno’s [Q3 2026 report](https://tokendyno.com/blog/provider-throughput-report-q3-2026/) attributes median output speed on **gpt-oss-120b** to Artificial Analysis: 1,753.0 vs. 690.1 output tokens/s. This is **not** a Kimi, Uncart, end-to-end or bounty measurement. |

## Reproduce the public demo (no purchase required)

1. Run `bash start-mac.sh` from the project folder. Without a model key, try a clearly labeled worked example.
2. To test the real integration, use an eligible Cerebras trial account, standard OpenClaw, and a public product link. Describe your actual gear. Run **Check live**, then expand **Check details** to inspect the provider and model.
3. Open the source for the recommendation. Try it on your own devices before treating the alternative as a match. FaceTime only opens on request; permissions, camera selection and sharing are manual.

No raw account logs, API keys, private patch or Home-directory profile is included. The [video template repository](https://github.com/wkasekende/cerebras-video-demos) was a visual reference.
