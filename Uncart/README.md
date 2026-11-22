# Uncart — Before you buy it

Paste the thing you are about to buy and describe the job you actually need done. Uncart asks what you already own, checks the evidence, and gives you a short way to try an alternative. If it cannot establish a match, it says so. No purchases, accounts or payment links.

[Watch or download the 60-second Uncart demo](docs/Uncart-60s.mp4) · [What was verified](docs/DEMO.md)

**The moment it worked:** a maker wanted someone on FaceTime to see a notebook. Instead of recommending a document camera, Uncart matched their iPhone, Mac and stand to Apple’s Desk View instructions. The maker tried it and confirmed the notebook was visible.

Built by [@theeagle2407](https://x.com/theeagle2407) with standard OpenClaw and Kimi K3.1 Pro on Cerebras.

## Start on the Mac

Unzip the download and open Terminal in the **Uncart** folder. Run:

    bash start-mac.sh

No npm install, database, gateway daemon or deployment. The launcher uses your installed Node 26 via nvm if available (Node 22+ is required). It opens a local browser page and prints its address. Keep this Terminal tab running. Stop it with Control-C.

For **Check live**, you need your standard OpenClaw CLI, the Cerebras provider installed in the existing `cerebras-weekend` profile, internet and a Cerebras API key authorized for `moonshotai-kimi-k3.1-pro-trial`. If the key is already exported in this Terminal, the launcher uses it. Otherwise the launcher prompts privately; typing is invisible. Press Return to skip and use the worked examples. Don't enter a key in the webpage or send one in a screenshot.

## First real test: a desk camera you might not need

1. Click **Desk camera** to see the saved walkthrough. This is deliberately marked **not live**.
2. Click **Use as live input**. Edit the phone, Mac, OS versions, stand and account details to match your own setup. The saved details are an example, not an inventory of your devices.
3. Click **Check live**. The result shows a recommendation, steps, conditions and source links. **Check details** shows the provider and model from OpenClaw’s response and whether the product page could actually be read. It does not claim the gear was tested.
4. If supported, click **Open FaceTime on my Mac**. This only opens the app; it does not call anyone or grant camera permissions. Select your iPhone in FaceTime’s Video menu, then open Desk View, frame the notebook and start it. Only mark **I tried it** after trying it. The mark lasts for this screen only.

The video replays this real recommendation. Its notebook shot is an illustration, not camera footage. It does not claim a purchase was avoided or a particular amount of money was saved.

## Second test: the bag limit

Open **Cabin bag → Use as live input** and enter the actual airline, fare, number of bags and outside dimensions when packed. Compare **39 × 29.5 × 20 cm** against **45 × 31 × 20 cm** for one Ryanair basic-fare personal bag. These should not both receive a positive verdict. Its size when packed matters, not just the litre rating. This is guidance for checking your booking, not a boarding guarantee.

## What is live, and what is not?

- **Live check:** the server reads the public product and relevant reference pages, then asks your local OpenClaw CLI for a decision using the Cerebras trial model. The code checks the receipt and matches evidence excerpts to text actually provided for that run. A quote match is not a guarantee that the model's reasoning is right. When a site cannot be read, reviewed sources may be used; those cards are explicitly dated **Saved source note**, not labelled freshly verified.
- **Worked example:** a hand-authored illustration using source notes. No OpenClaw call, elapsed model time, physical test or purchase.
- **Coverage:** the starter references cover Apple Desk View/Continuity Camera and the Ryanair personal-bag case. For a different purchase, add a public manufacturer manual or policy for the item you already have. The prototype does not independently search the entire web. A purchase listing alone is not proof. Pages requiring login, heavy JavaScript or non-text files (such as PDFs) may be unreadable.
- **Privacy:** the local app only listens on loopback. Public pages are read without browser cookies. Uncart does not write purchase history or your API key to its files. Input and source excerpts are sent to Cerebras via OpenClaw; your OpenClaw profile or provider may retain normal session records. Only enter information you’re comfortable sending. Don’t enter private/sign-in links, booking IDs or credentials.
- **Controls:** model calls use a temporary tool-denied config and a new session; the launcher does not rewrite your existing defaults. If that restriction or the model receipt cannot be verified, the run stops. A separate fixed FaceTime opener runs only when you click its button. No external commands are picked by the model.

## If something goes wrong

- No live check: make sure this is the Terminal where `openclaw --version` works and you have the Cerebras plugin in the `cerebras-weekend` profile. Relaunch with `bash start-mac.sh` after updating the environment. The green light for setup is an actual live result with the required receipt, not just “live enabled.”
- Cerebras busy or 429: wait a minute and retry once. Keep the form; don't reinstall or share the key. Check details rather than presenting an example as live.
- Can't see the page: use the exact local URL printed in Terminal. Uncart tries another free port if 4196 is already in use. There is no public URL.
- Camera unavailable: use the linked Apple steps, confirm the phone/OS combination, same Apple Account with two-factor authentication, Wi-Fi, Bluetooth and stable positioning. Don't promise the shot until you can see it.

## Sources and tests

Apple: [Desk View](https://support.apple.com/en-us/121541), [Continuity Camera](https://support.apple.com/en-us/102546). Example purchase: [IPEVO V4K](https://us.ipevo.com/pages/v4k). Travel: [Ryanair bag policy](https://help.ryanair.com/hc/en-gb/articles/12888036565521-Ryanair-s-Bag-Policy), [CabinZero Classic 28L](https://www.cabinzero.com/products/classic-cabin-backpack-28l), [CabinZero Classic 36L](https://www.cabinzero.com/products/classic-cabin-backpack-36l). Check the current source before relying on it.

`npm test` runs dependency-free tests for source handling, quote matching, recommendations, API endpoints, CLI receipts and the explicit local action. Automated tests use fixtures, not the trial account. This is the audience-choice project; it neither uses the private speed patch nor measures TPS.
