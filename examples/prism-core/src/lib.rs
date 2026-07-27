//! prism-core – Rust implementation of the stellar-address-kit address parser.
//!
//! This crate provides the canonical Rust parser for Stellar strkey addresses.
//! It deliberately has zero external dependencies so it can be embedded in any
//! Rust project (including the fuzzer) without pulling in an entire SDK.

pub mod address;
