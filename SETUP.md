# Setup — GitHub Profile README + Animated Rocket Graph

## 1. Special profile repo
GitHub shows a README as your profile page only if the repo name **exactly
matches your username** (case-sensitive-ish) and is public.

1. Create a new repo: `Avnish-kaushik/Avnish-kaushik` (public).
2. If you already have a "profile generator" repo automated for this
   purpose, you can drop these same files into that repo instead —
   just make sure it's the one named after your username, or update the
   image paths in `README.md` to point wherever the repo actually lives.
3. Upload everything in this folder (`README.md`, `assets/`, `dist/`,
   `scripts/`, `package.json`, `.github/workflows/rocket.yml`) to that repo.

The `dist/contrib-rocket.svg` already committed here is a **working demo
built from sample data** — the README will look right immediately. Once
the Action runs once with your real token (next step), it overwrites that
file with your actual contribution graph.

## 2. Let the rocket read your real contributions
GitHub's default `GITHUB_TOKEN` inside Actions can't read contribution
data (it's a different, more limited scope), so you need a personal token:

1. Go to **github.com/settings/tokens** → **Generate new token (classic)**.
2. Scope needed: `read:user` (that's the only one required).
3. Copy the token.
4. In your `Avnish-kaushik/Avnish-kaushik` repo → **Settings → Secrets and
   variables → Actions → New repository secret**.
   - Name: `GH_TOKEN`
   - Value: the token you copied
5. Go to the **Actions** tab → select "Update contribution rocket" →
   **Run workflow** (manual trigger) to generate it the first time.

After that it re-runs automatically every day at midnight UTC (edit the
cron in `.github/workflows/rocket.yml` if you want a different time), and
also runs on every push to `main`.

## 3. Customize
- **Colors / theme**: edit the `levels` color map and `#bgfill` /
  `#titlebar` gradients in `scripts/generate.js`.
- **Flight speed**: change `CYCLE` (seconds) in `scripts/generate.js`.
- **ASCII portrait**: regenerate `assets/ascii-whoami.svg` anytime with a
  new photo — happy to redo this if you send another picture.
- **Stats card themes**: the `github-readme-stats` / `-streak-stats` URLs
  in `README.md` support many `theme=` options if you want to try others.

## 4. Local preview (optional)
```bash
npm install        # nothing to install, but sets things up
GH_TOKEN=xxxx GH_USERNAME=Avnish-kaushik node scripts/generate.js
```
This writes `dist/contrib-rocket.svg` using your real data so you can
check it locally before pushing.
