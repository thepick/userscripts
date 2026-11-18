# Content Manager WebAssembly source

Reddit Content Manager 5.0 and Bluesky Content Manager 5.0 both embed this MIT-licensed Rust keyword candidate matcher. The userscripts normalize text and verify matches in JavaScript. They use the original JavaScript matcher when WebAssembly is unavailable or encounters a resource or runtime limit. The module has no network access, imports, or dependencies.

To build from this directory:

```sh
rustup target add --toolchain 1.95.0 wasm32-unknown-unknown
cargo +1.95.0 build --locked --release --target wasm32-unknown-unknown
```

The result is `target/wasm32-unknown-unknown/release/reddit_filter_candidates.wasm`. Its Base64 encoding is embedded as `candidateWasmPayload` in each userscript. The SHA-256 of the tested bytes embedded in version 5.0 is `b5a4fb18fa367ca51399bc94b3ec0cdb9b9f5c5ada85a935c68cc99af52e82b4`. Source paths in compiler-generated diagnostics can affect the binary hash across build directories.
