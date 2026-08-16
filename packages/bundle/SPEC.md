# bundle.json — spec 1

The manifest a build carries when it is uploaded to Synapse. It is a frozen
interface (IMPL.md §6.1): the play page reads `requires` to decide, before
starting anything, whether this device gets the game or the recording.

A bundle is a zip. `bundle.json` sits at its root. If it is absent, Synapse
infers one and shows you the guess — it is never written silently.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `spec` | `1` | yes | Version. Anything else is rejected rather than guessed at. |
| `name` | string | yes | 80 characters or fewer. |
| `entry` | string | yes | Path inside the zip. Must exist. |
| `engine` | `{name, version}` | no | Free-form. Used for catalogue facets only. |
| `canvas` | `{mode, …}` | no | `mode` is `fill` or `fixed`. `fixed` needs `width` and `height`. |
| `input` | string[] | no | `keyboard` `mouse` `gamepad` `touch` `pointerlock`. |
| `requires` | object | no, but warned | See below. |
| `minSpec` | string | no | Human sentence shown on the fallback screen. |
| `save` | `none` \| `local` | no | Cloud saves are not in spec 1. |
| `telemetry` | boolean | no | Defaults on. Opt out and the compatibility table stays empty. |

## `requires`

This block is the whole of capability gating.

```json
{
  "webgpu": true,
  "features": ["depth32float-stencil8"],
  "limits": { "maxStorageBufferBindingSize": 134217728 }
}
```

Before a build runs, Synapse requests an adapter and compares. A device that
cannot meet `features` or `limits` is served the recorded playthrough and
`minSpec` instead of a black screen.

Omitting `requires` is allowed and produces a warning: every device will be
asked to run the build, and the ones that cannot will fail in whatever way the
build fails, which is the situation this platform exists to remove.

## Limits

| Rule | Value | Result |
|---|---|---|
| Total unpacked size | 500 MB | error |
| Advised initial payload | 8 MB | warning, with the KTX2 saving named |
| File count | 5000 | error |
| Paths | no absolute paths, no `..` | error |

The size cap is the free tier's binding constraint, not a technical one — see
IMPL.md §10.3.

## Example

```json
{
  "spec": 1,
  "name": "Orbital Drift",
  "entry": "index.html",
  "engine": { "name": "three.js", "version": "r180" },
  "canvas": { "mode": "fill" },
  "input": ["keyboard", "mouse"],
  "requires": { "webgpu": true },
  "minSpec": "Discrete GPU or Apple Silicon",
  "save": "local",
  "telemetry": true
}
```

Validated by `validate.mjs` in this directory; the tests there are the
authority on behaviour.
