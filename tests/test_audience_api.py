"""Testes automatizados do WMK Audience API, sem bibliotecas externas."""
import json
import tempfile
import unittest
from pathlib import Path
from sys import path

path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from audience_api import connect, import_live, statistics, suggestions, report_html, classify

class TestAudienceAPI(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.db = connect(self.root / "teste.sqlite3")

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def seed(self):
        source = self.root / "chat.json"
        source.write_text(json.dumps({"messages": [
            {"author": "Ana", "message": "Como instalar o Godot?"},
            {"author": "Ana", "message": "Como instalar o Godot?"},
            {"author": "Bruno", "message": "Tem como exportar para Android?"},
            {"author": "Cris", "message": "Obrigado, ajudou!"}
        ]}, ensure_ascii=False), encoding="utf-8")
        return import_live(self.db, "Live de testes", source)

    def test_classification(self):
        self.assertEqual(classify("Como instalar o Godot?"), (1, "Instalação"))
        self.assertEqual(classify("Obrigado!")[0], 0)
        self.assertEqual(classify("Quero exportar para Android")[1], "Exportação")

    def test_import_deduplicates_and_counts(self):
        idx, n = self.seed()
        self.assertEqual(n, 3)
        summary = statistics(self.db, idx)
        self.assertEqual(summary["messages"], 3)
        self.assertEqual(summary["authors"], 3)
        self.assertEqual(summary["questions"], 2)
        self.assertEqual(sum(x["count"] for x in summary["topics"]), 2)

    def test_report_escapes_untrusted_titles(self):
        source = self.root / "unsafe.json"
        source.write_text('[{"author":"x","message":"Como instalar?"}]', encoding="utf-8")
        idx, _ = import_live(self.db, '<script>alert(1)</script>', source)
        generated = report_html(statistics(self.db, idx))
        self.assertNotIn("<script>", generated)
        self.assertIn("&lt;script&gt;", generated)

    def test_suggestions_generated(self):
        idx, _ = self.seed()
        self.assertTrue(suggestions(statistics(self.db, idx)))

    def test_missing_live(self):
        self.assertIsNone(statistics(self.db, 99999))

    def test_csv_import(self):
        source = self.root / "chat.csv"
        source.write_text("autor;mensagem;data\nA;Como configurar minha webcam?;2026-11-13\n", encoding="utf-8")
        idx, count = import_live(self.db, "Live CSV", source)
        self.assertEqual(count, 1)
        self.assertEqual(statistics(self.db, idx)["questions"], 1)

if __name__ == "__main__":
    unittest.main()
