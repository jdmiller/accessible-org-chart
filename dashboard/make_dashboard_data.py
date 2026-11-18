#!/usr/bin/env python3
"""Generate the synthetic data for the org chart dashboard (dashboard/).

Writes, next to this script:
  org_data.csv     node_id, manager_id, name, title, department, location
  tenure_data.js   const TENURE_DATA = [...]  (current and former staff, for the
                   "years" easter egg)

Everyone belongs to the fictional "Example Publishing Co.". Names are random
combinations of common first and last names, so any match with a real person is
coincidence. Seeded, so the output is reproducible:

    python3 make_dashboard_data.py            # default seed
    python3 make_dashboard_data.py --seed 7   # a different org
"""
import argparse
import csv
import json
import random
from datetime import date, timedelta
from pathlib import Path

FIRST = """Aaliyah Aaron Adele Adrian Aiden Alana Alberto Alma Amir Anika Ansel Arden Ari Asha
Astrid Aurora Bea Benji Bianca Bodhi Bram Brielle Callum Camila Carmen Cecil Celeste Cyrus
Dahlia Dante Darius Delphine Desmond Dina Eamon Edie Eero Elio Elise Emeka Enzo Esme Ezra
Farah Felix Fiona Florian Gemma Gideon Greer Gus Hamid Hazel Henrik Ida Imogen Indira Ingrid
Isak Ivo Jada Jalen Joaquin Juno Kaia Kamal Keiko Kenji Kira Lars Leif Leonie Lila Lionel
Lorcan Lucia Magnus Mae Malia Malik Marisol Mira Nadia Nico Niamh Nils Odette Olu Orla Otis
Paloma Pilar Quentin Rafa Ravi Remy Rhea Rocco Rosalind Rufus Saoirse Selma Silas Soren Suri
Tamsin Teo Thea Tobias Ulla Valeria Vida Wes Willa Xavi Yara Yosef Zadie Zane Zuri""".split()

LAST = """Abernathy Achebe Adeyemi Albescu Amari Ambrose Ashdown Bakshi Balogun Barrow Belmonte
Birkeland Blackwood Boateng Bramhall Calloway Carrow Castellanos Cavendish Chatterjee Coltrane
Corrigan Darrow Delacroix Desai Drummond Eastwick Ebner Ekwueme Esposito Fairbanks Falconer
Ferro Fitzroy Galloway Gallo Garnier Halloran Hartigan Hayashi Holloway Ibarra Iyer Jessup
Kagame Kaminski Kavanagh Kessler Kowalczyk Lachance Lindgren Locklear Lombardi Lowell Mahony
Marchetti Marlowe Mbeki Merriweather Montague Moreau Nakashima Navarro Nordahl Oyelaran
Pemberton Petrakis Quaresma Rasmussen Redfern Rinaldi Rosenthal Sandoval Satterfield Sauvage
Sekibo Silvestri Sorensen Stanhope Takeda Thackeray Toussaint Ueda Valdivia Vasquez Wainwright
Whitcombe Yamada Yeboah Zamora Zubiri""".split()

LOCATIONS = ["New York", "New York", "New York", "Boston", "London", "Remote"]

# Area -> (VP title, [(sub-department, director title, manager title, staff titles)])
AREAS = {
    "President & Publisher": {
        "Editorial": ("Vice President, Editorial", [
            ("Trade Editorial", "Editorial Director, Trade", "Executive Editor", ["Senior Editor", "Associate Editor", "Editorial Assistant"]),
            ("Academic Editorial", "Editorial Director, Academic", "Executive Editor", ["Acquisitions Editor", "Developmental Editor", "Editorial Assistant"]),
            ("Children's Books", "Publishing Director, Children's", "Senior Editor", ["Editor", "Associate Editor", "Editorial Assistant"]),
        ]),
        "Sales": ("Vice President, Sales", [
            ("Trade Sales", "Director, Trade Sales", "Regional Sales Manager", ["Field Sales Representative", "Key Account Manager", "Sales Assistant"]),
            ("Academic Sales", "Director, Academic Sales", "Regional Sales Manager", ["Sales Representative", "Learning Consultant", "Sales Coordinator"]),
            ("International Sales", "Director, International Sales", "Export Sales Manager", ["International Sales Associate", "Sales Coordinator"]),
        ]),
        "Marketing": ("Vice President, Marketing", [
            ("Trade Marketing", "Director, Trade Marketing", "Marketing Manager", ["Marketing Associate", "Digital Marketing Specialist", "Marketing Assistant"]),
            ("Publicity", "Director of Publicity", "Publicity Manager", ["Publicist", "Publicity Assistant"]),
            ("Academic Marketing", "Director, Academic Marketing", "Marketing Manager", ["Product Marketing Specialist", "Marketing Coordinator"]),
        ]),
        "Design & Production": ("Vice President, Design & Production", [
            ("Art & Design", "Creative Director", "Art Director", ["Senior Designer", "Designer", "Production Artist"]),
            ("Production", "Director of Production", "Production Manager", ["Production Editor", "Production Coordinator", "Copyeditor"]),
            ("Manufacturing", "Director of Manufacturing", "Manufacturing Manager", ["Print Buyer", "Manufacturing Coordinator"]),
        ]),
    },
    "Chief Operating Officer": {
        "Finance": ("Chief Financial Officer", [
            ("Accounting", "Controller", "Accounting Manager", ["Senior Accountant", "Accountant", "Accounts Payable Specialist"]),
            ("Royalties", "Director of Royalties", "Royalties Manager", ["Royalties Analyst", "Royalties Assistant"]),
        ]),
        "Technology": ("Chief Technology Officer", [
            ("Digital Products", "Director of Digital Products", "Engineering Manager", ["Software Engineer", "QA Engineer", "Product Designer"]),
            ("Information Technology", "Director of IT", "IT Manager", ["Systems Administrator", "Support Analyst"]),
        ]),
        "Operations": ("Vice President, Operations", [
            ("Distribution", "Director of Distribution", "Warehouse Manager", ["Inventory Analyst", "Customer Service Representative", "Logistics Coordinator"]),
            ("Contracts & Rights", "Director, Contracts & Rights", "Rights Manager", ["Contracts Specialist", "Permissions Coordinator"]),
        ]),
        "People": ("Vice President, People", [
            ("Human Resources", "Director, Human Resources", "HR Manager", ["HR Generalist", "Recruiter", "HR Coordinator"]),
        ]),
    },
}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent)
    args = ap.parse_args()
    rnd = random.Random(args.seed)
    today = date(2026, 11, 1)          # fixed so tenure is reproducible

    used = set()

    def person_name():
        while True:
            n = f"{rnd.choice(FIRST)} {rnd.choice(LAST)}"
            if n not in used:
                used.add(n)
                return n

    rows = []

    def add(manager, title, dept):
        node_id = f"e-{1001 + len(rows)}"
        rows.append({"node_id": node_id, "manager_id": manager, "name": person_name(),
                     "title": title, "department": dept, "location": rnd.choice(LOCATIONS)})
        return node_id

    def staff(manager, dept, titles, n, depth_left):
        for _ in range(n):
            t = rnd.choice(titles)
            sid = add(manager, t, dept)
            # Some senior staff lead a small team, which gives the chart deeper branches
            if depth_left > 0 and rnd.random() < 0.18:
                lead = rows[-1]
                lead["title"] = "Senior " + t if not t.startswith("Senior") else "Lead " + t[7:]
                staff(sid, dept, titles[-1:], rnd.randint(1, 3), depth_left - 1)

    for top_title, areas in AREAS.items():
        top = add("", top_title, "Senior Leadership")
        for area, (vp_title, subs) in areas.items():
            vp = add(top, vp_title, area)
            for sub, dir_title, mgr_title, staff_titles in subs:
                d = add(vp, dir_title, sub)
                for _ in range(rnd.randint(1, 3)):
                    m = add(d, mgr_title, sub)
                    staff(m, sub, staff_titles, rnd.randint(2, 7), 2)
                if rnd.random() < 0.5:                 # a director with direct individual contributors
                    staff(d, sub, staff_titles, rnd.randint(1, 2), 0)

    with open(args.out / "org_data.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator="\n")
        w.writeheader()
        w.writerows(rows)

    # Tenure: everyone in the org, plus former staff
    def years(a, b):
        return round((b - a).days / 365.25, 1)

    tenure = []
    for r in rows:
        y = min(38.0, rnd.expovariate(1 / 7.5))
        hired = today - timedelta(days=int(y * 365.25))
        tenure.append({"name": r["name"], "status": "Active", "hire_date": hired.isoformat(),
                       "term_date": None, "tenure_years": years(hired, today)})
    for _ in range(int(len(rows) * 0.35)):
        span = min(30.0, rnd.expovariate(1 / 3.5)) + 0.1
        left = today - timedelta(days=rnd.randint(30, 365 * 6))
        hired = left - timedelta(days=int(span * 365.25))
        tenure.append({"name": person_name(), "status": "Terminated", "hire_date": hired.isoformat(),
                       "term_date": left.isoformat(), "tenure_years": years(hired, left)})
    tenure.sort(key=lambda e: e["name"])

    with open(args.out / "tenure_data.js", "w", encoding="utf-8") as f:
        f.write("// Generated by make_dashboard_data.py. Synthetic data for Example Publishing Co.\n")
        f.write("const TENURE_DATA = " + json.dumps(tenure, ensure_ascii=False, separators=(",", ":")) + ";\n")

    print(f"wrote {len(rows)} people to org_data.csv and {len(tenure)} tenure records to tenure_data.js")


if __name__ == "__main__":
    main()
