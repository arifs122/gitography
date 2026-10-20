# Publishing gitography

Everything in this folder is ready to push. Nothing here requires `npm install`,
because the project has no dependencies.

- **Owner:** `arifs122`
- **Suggested repository name:** `gitography` (free on npm and not taken by any
  notable GitHub project)
- **Recommended visibility:** **private** first, then flip to public in
  Settings → General → Danger Zone when you are happy with it.

---

## 1. Push to GitHub

### Option A — GitHub website (no extra tools)

1. Go to <https://github.com/new>.
2. Repository name: `gitography`.
3. Visibility: **Private**.
4. Do **not** tick "Add a README", "Add .gitignore" or "Choose a license" — this
   folder already has all of them, and pre-creating them causes a merge conflict.
5. Click **Create repository**, then run, from this folder:

```bash
git init -b main
git add .
git commit -m "chore: initial commit"
git remote add origin https://github.com/arifs122/gitography.git
git push -u origin main
```

If you already ran `git init` and committed, skip the first two lines and just
do the `remote add` and `push`.

### Option B — GitHub CLI (one command)

```powershell
winget install --id GitHub.cli -e
# close and reopen the terminal so `gh` lands on PATH
gh auth login
gh repo create gitography --private --source . --push
```

`gh repo create` creates the repository, sets the remote and pushes in one step.

### Making it public later

```powershell
gh repo edit --visibility public --accept-visibility-change-consequences
```

or on the website: **Settings → General → Danger Zone → Change visibility**.

---

## 2. Optional: publish to npm

The name `gitography` is free on the npm registry. Publishing makes
`npx gitography` work for everyone, with no clone step.

```bash
npm login                 # create an account at https://www.npmjs.com/signup first
npm publish --access public
```

Before you publish, double-check what will be shipped:

```bash
npm pack --dry-run
```

`package.json`'s `files` field limits the package to `bin/`, `src/` and the
documentation, so `test/`, `tools/` and `docs/` stay out of the tarball.

## 3. Before pushing — sanity checklist

Run these from this folder and make sure they are all green:

```bash
npm test                                  # 79 tests, no install needed
node bin/gitography.js . --format text    # the CLI on itself
node tools/verify-report.mjs docs/demo/express.html
```

Confirm the report is still self-contained (the last command prints
`✓ … is self-contained`).

## 4. After pushing

A few small things that make a new repository look alive:

- add the repository description: *"A year-in-review report for any Git
  repository — a zero-dependency CLI that turns history into a self-contained
  interactive HTML report"*;
- add topics: `git`, `cli`, `visualization`, `analytics`, `report`, `html`,
  `zero-dependencies`, `developer-tools`, `wrapped`;
- pin the repository on your profile;
- the CI badge in the README starts working as soon as the first workflow run
  finishes.

---

## Make the repository look alive

Two minutes of settings work, and the highest-leverage thing you can do for a
repository you want people to star:

1. **Social preview image** — GitHub renders a preview card whenever the
   repository is linked in a chat, a tweet or an issue. Go to
   **Settings → General → Social preview → Upload an image** and use
   `docs/screenshots/hero.png`. GitHub crops to 1280x640, so check that the top-left region still
   reads well.
2. **Description** — paste the one-line pitch from the top of the README.
3. **Topics** — the tags that make the repository discoverable in search.
4. **Pin it** on your profile, and link it from any project that uses it.
