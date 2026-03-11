<p align="center"><code>node jasper-overlay/bin/jasper.js</code><br />or stage an installable package with <code>python3 jasper-overlay/scripts/build_package.py --version 0.1.0 --vendor-src codex-cli/vendor --pack-output ./dist/jasper-codex-0.1.0.tgz</code></p>
<p align="center"><strong>Jasper</strong> is a personal intelligence system built as a maintained Codex fork.</p>
<p align="center">
  Jasper adds identity, persistent memory, environment listeners, reflections, and tool generation on top of the upstream runtime while keeping the fork update-safe.
</p>

---

## Quickstart

### Running Jasper from source

```shell
pnpm install
node jasper-overlay/bin/jasper.js
```

### Staging an installable Jasper package

```shell
python3 codex-cli/scripts/install_native_deps.py
python3 jasper-overlay/scripts/build_package.py \
  --version 0.1.0 \
  --vendor-src codex-cli/vendor \
  --pack-output ./dist/jasper-codex-0.1.0.tgz

npm install -g ./dist/jasper-codex-0.1.0.tgz
jasper
```

### Notes

- The packaged `jasper` launcher uses the bundled native Codex binary plus Jasper-owned JS modules.
- Some deeper docs and source directories still use Codex naming because the fork inherits upstream internals.
- The maintained Jasper product contract lives in [docs/jasper/PROJECT_DETAILS.md](./docs/jasper/PROJECT_DETAILS.md).

## Docs

- [**Jasper PRD**](./docs/jasper/PROJECT_DETAILS.md)
- [**Jasper Fork Strategy**](./docs/jasper/FORK_STRATEGY.md)
- [**Jasper Overlay**](./jasper-overlay/README.md)
- [**Upstream Codex Documentation**](https://developers.openai.com/codex)
- [**Contributing**](./docs/contributing.md)
- [**Installing & building**](./docs/install.md)
- [**Open source fund**](./docs/open-source-fund.md)

This repository is licensed under the [Apache-2.0 License](LICENSE).
