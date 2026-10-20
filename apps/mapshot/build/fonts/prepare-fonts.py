"""Prepare owned-engine outline fonts and metadata with native FontTools."""

import json
import re
import sys
from pathlib import Path
from typing import Optional, TypedDict

from fontTools.ttLib import TTCollection, TTFont
from fontTools.varLib.instancer import instantiateVariableFont


class _FontMetadata(TypedDict):
    path: str
    source: str
    family: str
    weight: int
    codepoints: list[int]


class _PreparedFontMetadata(_FontMetadata, total=False):
    faceIndex: int


def _metadata(*, face: TTFont, path: str, source: str, face_index: Optional[int] = None) -> _PreparedFontMetadata:
    postscript_name = face["name"].getDebugName(6)
    family = postscript_name.split("-")[0].replace("InterVariable", "Inter")
    if not re.fullmatch(r"Inter|NotoSans[A-Za-z0-9]*|NotoSerifTibetan", family):
        raise ValueError("Unsupported font family in Mapshot build inputs.")
    result: _PreparedFontMetadata = {
        "path": path,
        "source": source,
        "family": family,
        "weight": min((400, 600, 700), key=lambda weight: abs(weight - face["OS/2"].usWeightClass)),
        "codepoints": sorted(codepoint for codepoint, glyph in face.getBestCmap().items() if face.getGlyphID(glyph) != 0),
    }
    if face_index is not None:
        result["faceIndex"] = face_index
    return result


if __name__ == "__main__":
    directory = Path(sys.argv[1])
    roles = []
    for weight, name in ((400, "Regular"), (600, "SemiBold"), (700, "Bold")):
        with TTFont(directory / "Inter.ttf", recalcTimestamp=False) as source:
            if "fvar" not in source or not any(axis.axisTag == "wght" for axis in source["fvar"].axes):
                raise ValueError("The Inter input must supply its variable weight axis.")
            axes = {"wght": weight}
            if any(axis.axisTag == "opsz" for axis in source["fvar"].axes):
                axes["opsz"] = 14
            face = instantiateVariableFont(source, axes, inplace=False)
            face.recalcTimestamp = False
            face["name"].setName("Inter " + name, 4, 3, 1, 0x409)
            face["name"].setName("Inter-" + name, 6, 3, 1, 0x409)
            path = f"inter-{weight}.ttf"
            face.save(directory / path)
            roles.append(_metadata(face=face, path=path, source="Inter.ttf"))
            face.close()

    fallbacks = []
    for input_index, path in enumerate(sorted(directory.iterdir())):
        if path.suffix.lower() not in (".ttf", ".otf", ".ttc") or path.name == "Inter.ttf" or path.name.startswith("inter-"):
            continue
        with path.open("rb") as source_file:
            collection_input = source_file.read(4) == b"ttcf"
        if not collection_input:
            with TTFont(path, recalcTimestamp=False) as face:
                fallbacks.append(_metadata(face=face, path=path.name, source=path.name))
            continue
        with TTCollection(path, recalcTimestamp=False) as collection:
            preserve_collection = all(face.sfntVersion == "OTTO" for face in collection.fonts)
            for index, face in enumerate(collection.fonts):
                if preserve_collection:
                    fallbacks.append(_metadata(face=face, path=path.name, source=path.name, face_index=index))
                    continue
                face.recalcTimestamp = False
                output = f"fallback-{input_index}-{index}.ttf"
                face.save(directory / output)
                fallbacks.append(_metadata(face=face, path=output, source=path.name))
    (directory / "prepared.json").write_text(json.dumps({"roles": roles, "fallbacks": fallbacks}, separators=(",", ":")), encoding="utf-8")
