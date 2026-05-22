import duckdb
from pathlib import Path

# ---------------------------------------------------
# Paths
# ---------------------------------------------------

BASE_DIR = Path(__file__).resolve().parents[1]

DATA_DIR = BASE_DIR / "data" / "processed"
DB_PATH = BASE_DIR / "data" / "muni_market.duckdb"

# ---------------------------------------------------
# Connect to DuckDB
# ---------------------------------------------------

con = duckdb.connect(str(DB_PATH))

# ---------------------------------------------------
# Create Trades Table
# ---------------------------------------------------

con.execute(f"""
CREATE OR REPLACE TABLE trades AS
SELECT *
FROM read_csv_auto('{DATA_DIR / "Trade_Output_Sample.csv"}')
""")

# ---------------------------------------------------
# Done
# ---------------------------------------------------

con.close()

print("DuckDB database created successfully.")
