"""Pruebas focalizadas: emparejamiento Lightroom por ruta, claves de job y composición preset vs 13 básicos."""
import os
import re
import sys
from pathlib import Path

import pymongo

sys.path.insert(0, str(Path(__file__).parents[1]))
from lr_sync import lr_job_ops, lr_job_payload, match_lr_jobs, norm_path_key  # noqa: E402

BASICS = ["Temperature", "Tint", "Exposure2012", "Contrast2012", "Highlights2012", "Shadows2012", "Whites2012",
          "Blacks2012", "Texture", "Clarity2012", "Dehaze", "Vibrance", "Saturation"]


def J(i, name, path=None):
    return {"id": i, "filename": name, "filename_lc": name.lower(), "path_key": norm_path_key(path)}


def by_key(res):
    return {r["key"]: r for r in res}


# ---------- emparejamiento ----------
def test_same_filename_two_folders_resolved_by_path():
    jobs = [J("a", "IMG_0001.CR3", "Boda/Card1/IMG_0001.CR3"), J("b", "IMG_0001.CR3", "Boda/Card2/IMG_0001.CR3")]
    cat = [{"key": "1", "name": "IMG_0001.CR3", "path": "/Users/k/Fotos/Boda/Card2/IMG_0001.CR3"},
           {"key": "2", "name": "IMG_0001.CR3", "path": "C:\\Fotos\\Boda\\Card1\\IMG_0001.CR3"}]
    r = by_key(match_lr_jobs(cat, jobs))
    assert r["1"]["status"] == "matched" and r["1"]["job_id"] == "b" and r["1"]["via"] == "path"
    assert r["2"]["job_id"] == "a"


def test_ambiguous_name_without_path_never_assigned():
    jobs = [J("a", "IMG_1.CR3", "X/IMG_1.CR3"), J("b", "IMG_1.CR3", "Y/IMG_1.CR3")]
    r = match_lr_jobs([{"key": "1", "name": "IMG_1.CR3", "path": "/otra/Z/IMG_1.CR3"}], jobs)[0]
    assert r["status"] == "ambiguous" and "job_id" not in r


def test_unique_filename_fallback_when_folder_moved():
    r = match_lr_jobs([{"key": "1", "name": "img_9.nef", "path": "/movida/IMG_9.NEF"}], [J("a", "IMG_9.NEF", "Orig/IMG_9.NEF")])[0]
    assert r["status"] == "matched" and r["via"] == "filename"


def test_collision_two_catalog_photos_same_job_is_reported_before_applying():
    jobs = [J("a", "IMG_5.CR3")]  # job heredado sin ruta
    cat = [{"key": "1", "name": "IMG_5.CR3", "path": "/a/IMG_5.CR3"}, {"key": "2", "name": "IMG_5.CR3", "path": "/b/IMG_5.CR3"}]
    res = match_lr_jobs(cat, jobs)
    assert all(r["status"] == "ambiguous" and "job_id" not in r for r in res)


def test_collision_keeps_exact_path_match():
    jobs = [J("a", "IMG_5.CR3", "Boda/IMG_5.CR3")]
    cat = [{"key": "1", "name": "IMG_5.CR3", "path": "/x/Boda/IMG_5.CR3"}, {"key": "2", "name": "IMG_5.CR3", "path": "/y/Otra/IMG_5.CR3"}]
    r = by_key(match_lr_jobs(cat, jobs))
    assert r["1"]["status"] == "matched" and r["2"]["status"] == "ambiguous"


def test_missing_reported():
    assert match_lr_jobs([{"key": "1", "name": "NADA.CR3", "path": "/x/NADA.CR3"}], [])[0]["status"] == "missing"


def test_suffix_must_match_whole_segment():
    r = match_lr_jobs([{"key": "1", "name": "IMG_1.CR3", "path": "/x/MiBoda/IMG_1.CR3"}],
                      [J("a", "IMG_1.CR3", "Boda/IMG_1.CR3"), J("b", "IMG_1.CR3", "Otra/IMG_1.CR3")])[0]
    assert r["status"] == "ambiguous"  # "miboda/..." no es la carpeta "boda/"


# ---------- claves de job ----------
def test_job_ops_keyed_by_path_and_supersede_legacy():
    ops = lr_job_ops("u", [("IMG_1.CR3", "Boda\\IMG_1.CR3", "<x/>")], "now")
    many = [o for o in ops if isinstance(o, pymongo.UpdateMany)]
    one = [o for o in ops if isinstance(o, pymongo.UpdateOne)]
    assert len(many) == 1 and many[0]._filter["path_key"] is None and many[0]._doc["$set"]["status"] == "superseded"
    assert one[0]._filter == {"user_id": "u", "path_key": "boda/img_1.cr3"}


def test_job_ops_without_path_stay_compatible():
    ops = lr_job_ops("u", [("IMG_1.CR3", None, "<x/>"), ("", "a", "<x/>"), ("B.CR3", None, "")], "now")
    assert len(ops) == 1 and ops[0]._filter == {"user_id": "u", "filename": "IMG_1.CR3", "path_key": None}


# ---------- payload ----------
def test_payload_ignores_nested_look_and_masks():
    xmp = '''<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"
 crs:Exposure2012="+0.30" crs:Temperature="5200" crs:WhiteBalance="Custom" xmp:Rating="5" xmp:Label="Verde">
<crs:Look><rdf:Description crs:Name="Adobe Color" crs:UUID="X" crs:Amount="1"/></crs:Look>
<crs:MaskGroupBasedCorrections><rdf:Seq><rdf:li><rdf:Description crs:CorrectionAmount="1"/></rdf:li></rdf:Seq></crs:MaskGroupBasedCorrections>
</rdf:Description></rdf:RDF></x:xmpmeta>'''
    p = lr_job_payload({"id": "j", "xmp_content": xmp})
    s = p["develop_settings"]
    assert s["CameraProfile"] == "Adobe Color" and "UUID" not in s and "Name" not in s and "CorrectionAmount" not in s
    assert s["WhiteBalance"] == "Custom" and p["expected"] == {"Exposure2012": 0.3, "Temperature": 5200.0}
    assert p["catalog_unsupported"] == ["MaskGroupBasedCorrections"] and p["rating"] == "5" and p["label"] == "Verde"


# ---------- composición preset vs 13 básicos ----------
def _server():
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")
    import server
    return server


PRESET = '''<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
 crs:PresetType="Normal" crs:UUID="ABC" crs:ShowInPresets="True" crs:Name="Mi look"
 crs:Exposure2012="+1.00" crs:Contrast2012="40" crs:Texture="25" crs:Saturation="-10" crs:Temperature="7000"
 crs:Tint="20" crs:WhiteBalance="Custom" crs:Exposure="0.5" crs:SplitToningHighlightHue="45" crs:CameraProfile="Adobe Portrait">
<crs:Clarity2012>30</crs:Clarity2012>
<crs:ToneCurvePV2012><rdf:Seq><rdf:li>0, 10</rdf:li><rdf:li>255, 245</rdf:li></rdf:Seq></crs:ToneCurvePV2012>
</rdf:Description></rdf:RDF></x:xmpmeta>'''

AI = {"exposure": 0.3, "contrast": 5, "highlights": -20, "shadows": 10, "whites": 4, "blacks": -6,
      "temperature": None, "tint": None, "texture": 0, "clarity": 0, "dehaze": 0, "vibrance": 3, "saturation": 0}


def count(xmp, name):
    return len(re.findall(r'crs:' + name + r'(?==|>)', xmp)) - len(re.findall(r'</crs:' + name + '>', xmp))


def test_preset_never_duplicates_or_overrides_ai_basics():
    s = _server()
    x = s.build_photo_xmp("A.CR3", AI, {}, PRESET, "Adobe Color", "balanced")
    for b in BASICS[2:]:
        assert count(x, b) == 1, b
    assert 'crs:Exposure2012="+0.30"' in x and 'crs:Contrast2012="5"' in x and 'crs:Texture="0"' in x
    assert 'crs:Clarity2012="0"' in x and 'crs:Saturation="0"' in x
    assert count(x, "Temperature") == 0 and count(x, "Tint") == 0 and 'crs:WhiteBalance="As Shot"' in x
    assert 'crs:Exposure="' not in x and "PresetType" not in x and "Adobe Portrait" not in x
    assert 'crs:SplitToningHighlightHue="45"' in x and "<rdf:li>0, 10</rdf:li>" in x  # look del preset intacto
    assert 'crs:HasSettings="True"' in x and 'xmp:Rating="5"' in x and 'xmp:Label="Verde"' in x


def test_ai_white_balance_wins_over_preset():
    s = _server()
    x = s.build_photo_xmp("A.CR3", {**AI, "temperature": 5100}, {}, PRESET, "Adobe Standard", "balanced")
    assert 'crs:Temperature="5100"' in x and 'crs:Tint="0"' in x and 'crs:WhiteBalance="Custom"' in x
    assert count(x, "Temperature") == 1 and count(x, "Tint") == 1


def test_missing_ai_values_written_as_zero_without_preset():
    s = _server()
    x = s.build_photo_xmp("A.CR3", {"exposure": 0.5}, {}, None, "Adobe Standard", "balanced")
    for b in BASICS[2:]:
        assert count(x, b) == 1, b
    assert 'crs:HasSettings="True"' in x and 'crs:WhiteBalance="As Shot"' in x
