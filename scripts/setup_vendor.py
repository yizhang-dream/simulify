"""Install offline Three.js and KaTeX runtimes and four-tier WOFF2 fonts into a Simulify project."""
import argparse
import shutil
import subprocess
import sys
import tarfile
import tempfile
from os.path import relpath
from pathlib import Path
from urllib.parse import quote

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FONTS_SRC = REPO_ROOT / "kit" / "fonts"
KATEX_SRC = REPO_ROOT / "kit" / "katex"

BASE_FILES = {
    "package/build/three.core.js": "three.core.js",
    "package/build/three.webgpu.js": "three.webgpu.js",
    "package/build/three.tsl.js": "three.tsl.js",
    "package/examples/jsm/environments/RoomEnvironment.js": "addons/environments/RoomEnvironment.js",
    "package/examples/jsm/geometries/RoundedBoxGeometry.js": "addons/geometries/RoundedBoxGeometry.js",
    "package/examples/jsm/utils/BufferGeometryUtils.js": "addons/utils/BufferGeometryUtils.js",
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

CJK_BASE_PUNCT = (
    "，。、；：？！“”‘’（）【】《》—…·「」『』℃°±×÷≠≤≥≈→←↑↓↔⇒⇔⌘"
    "播放暂停上幕下幕复位俯视导出确定取消关闭搜索语言中文进度步进"
)


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


def sync_fonts(
    target_dir: Path,
    *,
    source_fonts_dir: Path = DEFAULT_FONTS_SRC,
    fonts_subdir: str = "kit/fonts",
) -> Path:
    """Copy offline four-tier WOFF2 font assets, fonts.css, and LICENSES.txt into <target>/<fonts_subdir>."""
    src_dir = Path(source_fonts_dir).resolve()
    if not src_dir.is_dir():
        raise RuntimeError(f"Offline font source directory not found: {src_dir}")

    dest_dir = (Path(target_dir).resolve() / fonts_subdir).resolve()
    if dest_dir == src_dir:
        return dest_dir

    dest_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    for item in sorted(src_dir.iterdir()):
        if not item.is_file():
            continue
        if item.suffix.lower() == ".woff2":
            magic = item.read_bytes()[:4]
            if magic != b"wOF2":
                raise RuntimeError(f"Invalid WOFF2 signature in {item.name}: {magic!r}")
        elif item.name not in {"fonts.css", "LICENSES.txt"}:
            continue
        shutil.copy2(item, dest_dir / item.name)
        copied += 1

    if copied == 0:
        raise RuntimeError(f"No font assets found to copy in {src_dir}")
    return dest_dir


def sync_katex(target_dir: Path, *, fonts_subdir: str = "kit/fonts") -> Path:
    """Copy the offline KaTeX ESM and CSS into <target>/kit/katex."""
    target_dir = Path(target_dir).resolve()
    dest_dir = (target_dir / "kit" / "katex").resolve()
    if dest_dir == KATEX_SRC:
        return dest_dir

    fonts_dir = (target_dir / fonts_subdir).resolve()
    relative_fonts = Path(relpath(fonts_dir, dest_dir)).as_posix()
    dest_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(KATEX_SRC / "katex.mjs", dest_dir / "katex.mjs")
    css_src = KATEX_SRC / "katex.min.css"
    css_dest = dest_dir / css_src.name
    if relative_fonts == "../fonts":
        shutil.copy2(css_src, css_dest)
    else:
        css = css_src.read_text(encoding="utf-8")
        css_dest.write_text(css.replace("url(../fonts/", f"url({quote(relative_fonts)}/"), encoding="utf-8")
    return dest_dir


def _find_system_font(candidates: list[str]) -> Path | None:
    search_roots = [
        Path(r"C:\Windows\Fonts"),
        Path.home() / "AppData" / "Local" / "Microsoft" / "Windows" / "Fonts",
        Path("/Library/Fonts"),
        Path.home() / "Library" / "Fonts",
        Path("/usr/share/fonts"),
        Path.home() / ".local" / "share" / "fonts",
    ]
    for root in search_roots:
        if not root.exists():
            continue
        for name in candidates:
            direct = root / name
            if direct.is_file():
                return direct
            for found in root.rglob(name):
                if found.is_file():
                    return found
    return None


def collect_project_cjk_chars(project_dir: Path) -> set[str]:
    """Scan a Simulify project directory for all CJK, punctuation, and math-arrow glyphs."""
    chars = set(CJK_BASE_PUNCT)
    skip_dirs = {"vendor", "node_modules", ".git", "__pycache__", "dist", "build"}
    exts = {".html", ".js", ".mjs", ".css", ".json", ".md"}
    for path in Path(project_dir).resolve().rglob("*"):
        if not path.is_file() or path.suffix.lower() not in exts:
            continue
        if any(part in skip_dirs for part in path.parts):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for ch in text:
            cp = ord(ch)
            if (
                (0x4E00 <= cp <= 0x9FFF)
                or (0x3400 <= cp <= 0x4DBF)
                or (0x3001 <= cp <= 0x303F)
                or (0xFF01 <= cp <= 0xFFEF)
                or ch in "—…·“”‘’℃°±×÷≠≤≥≈→←↑↓↔⇒⇔⌘"
            ):
                chars.add(ch)
    chars.discard("\u3000")
    return chars


def subset_cjk_for_project(
    project_dir: Path,
    fonts_out_dir: Path,
    *,
    sans_src: Path | None = None,
    serif_src: Path | None = None,
) -> list[Path]:
    """Generate compact project-specific NotoSansSC / NotoSerifSC WOFF2 subsets using fontTools + brotli."""
    try:
        from fontTools.subset import Options, Subsetter
        from fontTools.ttLib import TTFont
        from fontTools.varLib.instancer import instantiateVariableFont
    except ImportError as exc:
        raise RuntimeError(
            "CJK subsetting requires `fonttools` and `brotli`. Run via:\n"
            "  uv run --with fonttools --with brotli python scripts/setup_vendor.py <target> --subset-cjk <project_dir>"
        ) from exc

    chars = collect_project_cjk_chars(project_dir)
    if not chars:
        raise RuntimeError(f"No CJK characters discovered under {project_dir}")
    payload = "".join(sorted(chars))

    resolved_sans = sans_src or _find_system_font(["NotoSansSC-VF.ttf", "NotoSansCJKsc-Regular.otf"])
    resolved_serif = serif_src or _find_system_font(["NotoSerifSC-VF.ttf", "NotoSerifCJKsc-Bold.otf"])
    if not resolved_sans and not resolved_serif:
        raise RuntimeError(
            "Could not locate local NotoSansSC-VF.ttf or NotoSerifSC-VF.ttf. "
            "Pass --cjk-sans-src and/or --cjk-serif-src explicitly."
        )

    fonts_out_dir = Path(fonts_out_dir).resolve()
    fonts_out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    def _build_one(src: Path, dest_name: str, axis_limits: dict | None) -> Path:
        font = TTFont(src)
        opts = Options()
        opts.layout_features = ["kern", "liga", "ccmp", "palt"]
        opts.hinting = False
        opts.desubroutinize = True
        subsetter = Subsetter(opts)
        subsetter.populate(text=payload)
        subsetter.subset(font)
        if axis_limits and "fvar" in font:
            instantiateVariableFont(font, axis_limits, inplace=True)
        font.flavor = "woff2"
        out_path = fonts_out_dir / dest_name
        font.save(out_path)
        return out_path

    if resolved_sans:
        written.append(_build_one(resolved_sans, "NotoSansSC-Variable.woff2", {"wght": (400, 700)}))
    if resolved_serif:
        written.append(_build_one(resolved_serif, "NotoSerifSC-Display.woff2", {"wght": 650}))
        with TTFont(resolved_serif, lazy=True) as serif:
            regular_src = resolved_serif
            if "fvar" not in serif and serif["OS/2"].usWeightClass != 400:
                regular_src = DEFAULT_FONTS_SRC / "NotoSerifSC-Regular.woff2"
        written.append(_build_one(regular_src, "NotoSerifSC-Regular.woff2", {"wght": 400}))
    return written


def _report_dir(label: str, directory: Path) -> None:
    total_bytes = 0
    print(f"{label}: {directory}")
    for p in sorted(directory.rglob("*")):
        if p.is_file():
            sz = p.stat().st_size
            total_bytes += sz
            print(f"  {p.relative_to(directory).as_posix()} ({sz:,} B)")
    print(f"Total {label} size: {total_bytes / (1024 * 1024):.2f} MB ({total_bytes:,} B)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python scripts/setup_vendor.py my-explainer\n"
            "  python scripts/setup_vendor.py examples/shared --no-fonts\n"
            "  python scripts/setup_vendor.py my-explainer --fonts-only\n"
            "  uv run --with fonttools --with brotli python scripts/setup_vendor.py my-explainer "
            "--fonts-only --subset-cjk my-explainer\n"
        ),
    )
    parser.add_argument("target", type=Path, help="Destination project directory (receives vendor/three/, kit/fonts/, and kit/katex/)")
    parser.add_argument("--version", default="0.187.0", help="Official three npm version (default: 0.187.0)")
    parser.add_argument("--no-legacy", action="store_true", help="Omit legacy three.module.js WebGL-only bundle")
    parser.add_argument("--no-fx", action="store_true", help="Omit TSL post-processing display nodes (Bloom/DoF)")
    parser.add_argument("--no-fonts", action="store_true", help="Skip syncing offline kit/fonts/ WOFF2 assets")
    parser.add_argument("--no-katex", action="store_true", help="Skip syncing offline KaTeX ESM and CSS")
    parser.add_argument("--fonts-only", action="store_true", help="Sync/subset offline fonts and sync KaTeX (skip npm pack three)")
    parser.add_argument(
        "--fonts-dir",
        default="kit/fonts",
        help="Relative destination path for offline fonts inside target (default: kit/fonts)",
    )
    parser.add_argument(
        "--subset-cjk",
        type=Path,
        default=None,
        metavar="PROJECT_DIR",
        help=(
            "Scan PROJECT_DIR for used CJK glyphs and rebuild ultra-compact offline "
            "NotoSansSC-Variable.woff2 / NotoSerifSC-Display.woff2 / NotoSerifSC-Regular.woff2 subsets "
            "(requires fonttools + brotli)"
        ),
    )
    parser.add_argument("--cjk-sans-src", type=Path, default=None, help="Explicit NotoSansSC-VF.ttf path for --subset-cjk")
    parser.add_argument("--cjk-serif-src", type=Path, default=None, help="Explicit NotoSerifSC-VF.ttf path for --subset-cjk")
    args = parser.parse_args()

    if not args.fonts_only:
        out_dir = vendor_three(
            args.target,
            args.version,
            include_legacy=not args.no_legacy,
            include_fx=not args.no_fx,
        )
        _report_dir(f"three@{args.version}", out_dir)

    if not args.no_fonts:
        fonts_dest = sync_fonts(args.target, fonts_subdir=args.fonts_dir)
        if args.subset_cjk is not None:
            rebuilt = subset_cjk_for_project(
                args.subset_cjk,
                fonts_dest,
                sans_src=args.cjk_sans_src,
                serif_src=args.cjk_serif_src,
            )
            print(f"Rebuilt {len(rebuilt)} project-tailored CJK subset(s) from {args.subset_cjk}")
        _report_dir("fonts", fonts_dest)

    if not args.no_katex:
        katex_dest = sync_katex(args.target, fonts_subdir=args.fonts_dir)
        _report_dir("KaTeX", katex_dest)


if __name__ == "__main__":
    main()
