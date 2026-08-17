# Client architecture

A client repository owns `config/`, `custom/`, assets, optional database seeds and thin app adapters. It consumes versioned Aether packages rather than copying platform code. Secrets remain in runtime secret stores, never in `config/`.
