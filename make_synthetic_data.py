#!/usr/bin/env python3
"""Generate org_data.csv: a fictional, non-hierarchical-friendly org for the demos.

Every name is randomly combined from common first and last names, so any match
with a real person is coincidence. Seeded, so the output is reproducible.
Columns: node_id, manager_id, name, department, title
"""
import csv
import random

random.seed(42)

FIRST = ["Avery", "Jordan", "Taylor", "Morgan", "Riley", "Casey", "Quinn", "Parker", "Rowan", "Sage",
         "Elliot", "Harper", "Jamie", "Kai", "Logan", "Marlow", "Noor", "Oakley", "Priya", "Reese",
         "Sam", "Tatum", "Uma", "Wren", "Yusuf", "Zara", "Ines", "Mateo", "Lena", "Omar", "Hana", "Diego"]
LAST = ["Alvarez", "Bennett", "Chen", "Dalton", "Ellis", "Foster", "Gupta", "Hale", "Ito", "Jensen",
        "Khan", "Lindqvist", "Moreno", "Nguyen", "Okafor", "Patel", "Quigley", "Rivera", "Santos", "Tran",
        "Underwood", "Varga", "Whitfield", "Xu", "Yilmaz", "Zielinski", "Abbott", "Brandt", "Costa", "Dube"]

# department -> (head title, manager title, staff titles, team count, staff per team)
DEPTS = {
    "Sales": ("Vice President, Sales", "Regional Sales Manager", ["Sales Representative", "Account Executive"], 5, 8),
    "Editorial/Publishing": ("Editor-in-Chief", "Senior Editor", ["Associate Editor", "Editorial Assistant"], 4, 6),
    "Marketing/Publicity": ("Vice President, Marketing", "Marketing Manager", ["Publicist", "Marketing Associate"], 3, 7),
    "Design/Art": ("Creative Director", "Art Director", ["Designer", "Production Artist"], 2, 6),
    "Technology/IT": ("Chief Technology Officer", "Engineering Manager", ["Software Engineer", "Systems Analyst"], 2, 6),
    "Production": ("Director of Production", "Production Manager", ["Production Editor", "Production Coordinator"], 2, 5),
    "Operations/Administration": ("Vice President, Operations", "Operations Manager", ["Operations Analyst", "Administrative Assistant"], 1, 5),
    "General Management": ("Chief Financial Officer", "Finance Manager", ["Accountant", "Financial Analyst"], 2, 5),
    "Legal/Rights": ("General Counsel", "Rights Manager", ["Contracts Specialist"], 1, 2),
    "Human Resources": ("Director, Human Resources", "HR Manager", ["HR Coordinator"], 1, 2),
}

used = set()
def name():
    while True:
        n = f"{random.choice(FIRST)} {random.choice(LAST)}"
        if n not in used:
            used.add(n)
            return n

rows, next_id = [], [1000]
def add(mgr, dept, title):
    nid = next_id[0]; next_id[0] += 1
    rows.append([nid, mgr, name(), dept, title])
    return nid

chair = add("", "Executive/Management", "Chair of the Board")
for dept, (head_t, mgr_t, staff_t, teams, per) in DEPTS.items():
    head = add(chair, dept, head_t)
    for _ in range(teams):
        m = add(head, dept, mgr_t)
        for _ in range(random.randint(max(1, per - 2), per)):
            add(m, dept, random.choice(staff_t))

with open("org_data.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["node_id", "manager_id", "name", "department", "title"])
    w.writerows(rows)
print(f"wrote {len(rows)} rows")
