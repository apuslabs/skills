"""
End-to-end encrypt → decrypt roundtrip tests.
"""

import hashlib
from pathlib import Path

import pytest

from encrypt_pack import encrypt_pack
from decrypt_unpack import decrypt_unpack


def file_hashes(directory: Path) -> dict[str, str]:
    """Return { relative_path: sha256_hex } for all files in directory."""
    result = {}
    for f in sorted(directory.rglob('*')):
        if f.is_file():
            rel = f.relative_to(directory).as_posix()
            result[rel] = hashlib.sha256(f.read_bytes()).hexdigest()
    return result


class TestRoundtrip:
    def test_basic_roundtrip(self, memory_dir, tmp_path, test_wallet_src):
        bundle = tmp_path / "bundle.enc"
        manifest = tmp_path / "manifest.json"
        out = tmp_path / "restored"

        enc_manifest = encrypt_pack(
            input_dir=memory_dir,
            out_bundle=bundle,
            out_manifest=manifest,
            wallet_src=test_wallet_src,
            filter_pattern="*.md",
        )

        count = decrypt_unpack(
            bundle_path=bundle,
            manifest_path=manifest,
            out_dir=out,
            wallet_src=test_wallet_src,
        )

        assert count == enc_manifest["inventory"]["file_count"]

        # Only .md files should be restored
        restored_files = {f.name for f in out.rglob('*') if f.is_file()}
        assert "user.md" in restored_files
        assert "project.md" in restored_files
        assert "notes.md" in restored_files
        # Non-.md files must be absent
        assert "skip.txt" not in restored_files
        assert "config.json" not in restored_files

    def test_content_integrity(self, memory_dir, tmp_path, test_wallet_src):
        bundle = tmp_path / "bundle.enc"
        manifest = tmp_path / "manifest.json"
        out = tmp_path / "restored"

        encrypt_pack(memory_dir, bundle, manifest, test_wallet_src, "*.md")
        decrypt_unpack(bundle, manifest, out, test_wallet_src)

        for fname in ["user.md", "project.md", "notes.md"]:
            orig = (memory_dir / fname).read_bytes()
            rest = (out / fname).read_bytes()
            assert orig == rest, f"{fname} content mismatch after roundtrip"

    def test_wildcard_filter_includes_all(self, memory_dir, tmp_path, test_wallet_src):
        bundle = tmp_path / "bundle.enc"
        manifest = tmp_path / "manifest.json"
        out = tmp_path / "restored"

        encrypt_pack(memory_dir, bundle, manifest, test_wallet_src, filter_pattern="*")
        decrypt_unpack(bundle, manifest, out, test_wallet_src)

        restored = {f.name for f in out.rglob('*') if f.is_file()}
        assert "skip.txt" in restored
        assert "config.json" in restored

    def test_nested_directories(self, tmp_path, test_wallet_src):
        src = tmp_path / "src"
        nested = src / "subdir"
        nested.mkdir(parents=True)
        (src / "a.md").write_text("top level")
        (nested / "b.md").write_text("nested level")

        bundle = tmp_path / "bundle.enc"
        manifest = tmp_path / "manifest.json"
        out = tmp_path / "restored"

        encrypt_pack(src, bundle, manifest, test_wallet_src, "*.md")
        decrypt_unpack(bundle, manifest, out, test_wallet_src)

        assert (out / "a.md").read_text() == "top level"
        assert (out / "subdir" / "b.md").read_text() == "nested level"

    def test_empty_file(self, tmp_path, test_wallet_src):
        src = tmp_path / "src"
        src.mkdir()
        (src / "empty.md").write_bytes(b"")

        bundle = tmp_path / "bundle.enc"
        manifest = tmp_path / "manifest.json"
        out = tmp_path / "restored"

        encrypt_pack(src, bundle, manifest, test_wallet_src, "*.md")
        decrypt_unpack(bundle, manifest, out, test_wallet_src)

        assert (out / "empty.md").read_bytes() == b""

    def test_unicode_content(self, tmp_path, test_wallet_src):
        src = tmp_path / "src"
        src.mkdir()
        content = "# 中文标题\n\nこんにちは 🌍\n"
        (src / "unicode.md").write_text(content, encoding="utf-8")

        bundle = tmp_path / "bundle.enc"
        manifest = tmp_path / "manifest.json"
        out = tmp_path / "restored"

        encrypt_pack(src, bundle, manifest, test_wallet_src, "*.md")
        decrypt_unpack(bundle, manifest, out, test_wallet_src)

        assert (out / "unicode.md").read_text(encoding="utf-8") == content

    def test_no_files_raises(self, tmp_path, test_wallet_src):
        src = tmp_path / "src"
        src.mkdir()
        (src / "skip.txt").write_text("not matching")

        with pytest.raises(ValueError, match="No files matching"):
            encrypt_pack(src, tmp_path / "b.enc", tmp_path / "m.json",
                         test_wallet_src, "*.md")

    def test_sequence_increments(self, memory_dir, tmp_path, test_wallet_src):
        b1, m1 = tmp_path / "b1.enc", tmp_path / "m1.json"
        b2, m2 = tmp_path / "b2.enc", tmp_path / "m2.json"

        man1 = encrypt_pack(memory_dir, b1, m1, test_wallet_src, "*.md",
                            existing_sequence=0)
        man2 = encrypt_pack(memory_dir, b2, m2, test_wallet_src, "*.md",
                            existing_sequence=man1["sequence"])

        assert man1["sequence"] == 1
        assert man2["sequence"] == 2
