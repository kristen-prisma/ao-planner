# A&O Profitability Planner

Scenario-modeling tool for the Asia & Oceania program at Prisma.

## Running locally

You need Node.js installed (nodejs.org, LTS version).

```bash
npm install
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173/ao-planner/`).

## Deploying to GitHub Pages

One-time setup:

1. Create a new empty repository on GitHub called `ao-planner` (the name must match the `base` in `vite.config.js`).
2. In this project folder, initialize git and push:

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/ao-planner.git
git push -u origin main
```

3. Deploy:

```bash
npm run deploy
```

4. On GitHub, go to the repo → Settings → Pages → Source: "Deploy from a branch" → Branch: `gh-pages` → Save.

Within a minute the site is live at `https://YOUR-USERNAME.github.io/ao-planner/`.

## Updating after changes

```bash
git add .
git commit -m "what you changed"
git push
npm run deploy
```

## Notes

- Scenarios are saved in each user's browser (localStorage). Nothing is shared between devices or people.
- If you rename the repo, update `base` in `vite.config.js` to match.
- The tool uses data from Prisma's 26-27 Conservative budget as its default anchor; edit `DEFAULT_SCENARIO` in `src/App.jsx` to change the starting values.
