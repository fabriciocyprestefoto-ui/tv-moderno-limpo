# Repository Guidelines

## Project Structure & Module Organization
This repository is a Vite + React + TypeScript codebase for Redflix TV/Android builds.
- Core web app (main working area): root-level `App.tsx`, `index.tsx`, and folders like `components/`, `pages/`, `features/`, `services/`, `hooks/`, `utils/`, `contexts/`, `types/`.
- Static assets: `public/`.
- Android native wrapper: `android/` (Capacitor output and Gradle project).
- Mobile variant: `appandroid/` (separate package/scripts).
- Tooling/scripts: `scripts/`, `*.mjs`, `*.ts` helper scripts.
- Avoid editing archived/backup trees unless required: `como/`, `tv/`, `Nova pasta*`, `_backup_restore_point/`.

## Build, Test, and Development Commands
From repository root:
- `npm run dev`: start local Vite dev server (`http://localhost:5173`).
- `npm run build`: create production bundle in `dist/`.
- `npm run preview`: serve the built output locally.
- `npm run build:android`: build web assets and sync Capacitor Android project (sempre após mudar o bundle web antes de gerar APK).
- `npm run build:apk` / `npm run build:apk:debug`: produce release/debug APK via Gradle.
- **AppValidator (release):** após assinar o APK de release, obtenha o SHA256 do certificado (`keytool -printcert -jarfile app-release.apk`) e defina `EXPECTED_SIGNATURE` em `android/app/src/main/java/com/redx/tvbox/AppValidator.java` (hex sem dois-pontos, maiúsculas). Enquanto for o placeholder, `MainActivity` não chama `validate()` e apenas registra aviso no logcat.
- **Release signing:** `assembleRelease` uses `android/redx-release.jks`. Set `KEYSTORE_PASSWORD`, `KEY_PASSWORD`, and optionally `KEY_ALIAS` in `android/local.properties` (see `android/local.properties.example`) or export the same as environment variables. If the password does not match the keystore, the release build fails — use the password you chose when creating the JKS, or run `npm run create:keystore` for a fresh keystore and copy those values into `local.properties`.
- `npx tsc --noEmit`: strict type-check (recommended before PR).

For mobile variant (`appandroid/`):
- `cd appandroid && npm run dev|build|lint`.

## Coding Style & Naming Conventions
- Language: TypeScript (`strict: true`) with React function components.
- Indentation: 2 spaces; keep imports grouped and sorted logically.
- Components/pages: PascalCase (`LiveTV.tsx`, `HeroBanner.tsx`).
- Hooks: `useXxx` camelCase (`useRemoteControl.tsx`).
- Utilities/services: camelCase file names (`mediaMapper.ts`, `catalogService.ts`).
- Use alias `@/` for root-based imports where practical.

## Testing Guidelines
There is no single automated test suite configured at root. Use layered validation:
- Required: `npm run build` and `npx tsc --noEmit`.
- **Cypress E2E:** `npm run e2e` sobe o Vite dev server na porta **5173** e executa `cypress run`. `npm run e2e:ci` usa `vite build --mode e2e` (carrega `.env.e2e` com `VITE_E2E=1` para o teste do ErrorBoundary global), serve o bundle com `preview` na porta **4173** e corre `cy:run:ci` com `baseUrl` alinhado. Na CI, `.github/workflows/e2e.yml` pode gravar um `.env` mínimo e chamar `e2e:ci`; artefactos: screenshots (falha) e JUnit em `cypress/results/` quando configurado.
- Stubs de rede vivem em `cypress/support/stubs.ts` e fixtures em `cypress/fixtures/e2e/` (auth, TMDB, catálogo de exemplo com `sampleCatalog`).
- Feature checks: run targeted scripts/tests when touching related flows (for example `node test_admin_login.mjs` or HTML smoke files in root).
- For playback/navigation changes, include manual TV/D-pad verification notes in PR.

## Commit & Pull Request Guidelines
Git history follows Conventional Commit style, mainly:
- `fix: ...`
- `feat: ...`

Keep commit subjects imperative and scoped (example: `fix: handle invalid stream URL in LiveTV`).

PRs should include:
- Clear summary and affected areas/files.
- Linked issue/task when available.
- Validation evidence (`build`, `tsc`, manual checks).
- Screenshots/video for UI changes (especially TV focus/navigation/player screens).
