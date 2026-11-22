"""Download and extract official Three.js ESM files (WebGPU + TSL + legacy WebGL) into <target>/vendor/three/."""
import argparse
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

BASE_FILES = {
    "package/build/three.core.js": "three.core.js",
    "package/build/three.webgpu.js": "three.webgpu.js",
    "package/build/three.tsl.js": "three.tsl.js",
    "package/examples/jsm/environments/RoomEnvironment.js": "addons/environments/RoomEnvironment.js",
    "package/examples/jsm/geometries/RoundedBoxGeometry.js": "addons/geometries/RoundedBoxGeometry.js",
}

LEGACY_FILES = {
    "package/build/three.module.js": "three.module.js",
}

FX_FILES = {
    "package/examples/jsm/tsl/display/BloomNode.js": "addons/tsl/display/BloomNode.js",
    "package/examples/jsm/tsl/display/GaussianBlurNode.js": "addons/tsl/display/GaussianBlurNode.js",
    "package/examples/jsm/tsl/display/DepthOfFieldNode.js": "addons/tsl/display/DepthOfFieldNode.js",
}

# Kept for backward compatibility with scripts importing REQUIRED_FILES
REQUIRED_FILES = {**BASE_FILES, **LEGACY_FILES, **FX_FILES}


def vendor_three(
    target_dir: Path,
    version: str = "0.187.0",
    *,
    include_legacy: bool = True,
    include_fx: bool = True,
) -> Path:
    """Pack official three@<version> from npm and extract offline WebGPU + TSL + addons ESM runtime."""
    target_dir = target_dir.resolve()
    out_dir = target_dir / "vendor" / "three"
    npm_exe = shutil.which("npm.cmd") or shutil.which("npm")
    if not npm_exe:
        raise RuntimeError("npm executable not found on PATH")

    files_to_extract = dict(BASE_FILES)
    if include_legacy:
        files_to_extract.update(LEGACY_FILES)
    if include_fx:
        files_to_extract.update(FX_FILES)

    with tempfile.TemporaryDirectory(prefix="three-vendor-") as tmp:
        tmp_path = Path(tmp)
        proc = subprocess.run(
            [npm_exe, "pack", f"three@{version}", "--silent"],
            cwd=str(tmp_path),
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"npm pack failed ({proc.returncode}): {proc.stderr.strip() or proc.stdout.strip()}")

        tarballs = list(tmp_path.glob("three-*.tgz"))
        if not tarballs:
            raise RuntimeError("npm pack produced no tarball")
        tgz = tarballs[0]

        if out_dir.exists():
            shutil.rmtree(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        with tarfile.open(tgz, "r:gz") as tf:
            members = {m.name: m for m in tf.getmembers()}
            for src_member, rel_dest in files_to_extract.items():
                if src_member not in members:
                    raise RuntimeError(f"Expected file missing from three@{version}: {src_member}")
                dest_path = out_dir / rel_dest
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                extracted = tf.extractfile(members[src_member])
                if extracted is None:
                    raise RuntimeError(f"Unable to read {src_member}")
                dest_path.write_bytes(extracted.read())

    # Sanity-check split ESM imports so offline module resolution is guaranteed.
    webgpu_head = (out_dir / "three.webgpu.js").read_text(encoding="utf-8", errors="ignore")[:16384]
    if "three.core.js" not in webgpu_head or "three.tsl.js" not in webgpu_head:
        print("Warning: three.webgpu.js header did not mention three.core.js and three.tsl.js", file=sys.stderr)
    if include_legacy:
        module_head = (out_dir / "three.module.js").read_text(encoding="utf-8", errors="ignore")[:8192]
        if "three.core.js" not in module_head:
            print("Warning: three.module.js header did not mention three.core.js", file=sys.stderr)
    return out_dir


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path, help="Directory that will receive vendor/three/")
    parser.add_argument("--version", default="0.187.0", help="Official three npm version")
    parser.add_argument("--no-legacy", action="store_true", help="Omit legacy three.module.js WebGL-only bundle")
    parser.add_argument("--no-fx", action="store_true", help="Omit TSL post-processing display nodes (Bloom/DoF)")
    args = parser.parse_args()
    out_dir = vendor_three(
        args.target,
        args.version,
        include_legacy=not args.no_legacy,
        include_fx=not args.no_fx,
    )
    print(f"Vendored three@{args.version} to {out_dir}")
    total_bytes = 0
    for p in sorted(out_dir.rglob("*")):
        if p.is_file():
            sz = p.stat().st_size
            total_bytes += sz
            print(f"  {p.relative_to(out_dir).as_posix()} ({sz:,} B)")
    print(f"Total vendor size: {total_bytes / (1024 * 1024):.2f} MB ({total_bytes:,} B)")


if __name__ == "__main__":
    main()
