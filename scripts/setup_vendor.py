"""Download and extract official Three.js ESM files into <target>/vendor/three/."""
import argparse
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

REQUIRED_FILES = {
    "package/build/three.module.js": "three.module.js",
    "package/build/three.core.js": "three.core.js",
    "package/examples/jsm/environments/RoomEnvironment.js": "addons/environments/RoomEnvironment.js",
    "package/examples/jsm/geometries/RoundedBoxGeometry.js": "addons/geometries/RoundedBoxGeometry.js",
}


def vendor_three(target_dir: Path, version: str = "0.187.0") -> Path:
    """Pack official three@<version> from npm and extract minimal ESM runtime + addons."""
    target_dir = target_dir.resolve()
    out_dir = target_dir / "vendor" / "three"
    npm_exe = shutil.which("npm.cmd") or shutil.which("npm")
    if not npm_exe:
        raise RuntimeError("npm executable not found on PATH")

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
            for src_member, rel_dest in REQUIRED_FILES.items():
                if src_member not in members:
                    raise RuntimeError(f"Expected file missing from three@{version}: {src_member}")
                dest_path = out_dir / rel_dest
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                extracted = tf.extractfile(members[src_member])
                if extracted is None:
                    raise RuntimeError(f"Unable to read {src_member}")
                dest_path.write_bytes(extracted.read())

    # Sanity-check the core split import so module resolution is guaranteed.
    module_head = (out_dir / "three.module.js").read_text(encoding="utf-8", errors="ignore")[:8192]
    if "three.core.js" not in module_head:
        print("Warning: three.module.js header did not mention three.core.js", file=sys.stderr)
    return out_dir


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path, help="Lesson directory that will receive vendor/three/")
    parser.add_argument("--version", default="0.187.0", help="Official three npm version")
    args = parser.parse_args()
    out_dir = vendor_three(args.target, args.version)
    print(f"Vendored three@{args.version} to {out_dir}")
    for p in sorted(out_dir.rglob("*")):
        if p.is_file():
            print(f"  {p.relative_to(out_dir).as_posix()} ({p.stat().st_size:,} B)")


if __name__ == "__main__":
    main()
