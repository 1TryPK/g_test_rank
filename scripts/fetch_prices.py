import json
from datetime import datetime, timezone
from pathlib import Path
import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
INDEX_PATH = ROOT / "data" / "index.json"


def get_yahoo_price(symbol: str) -> tuple[float | None, str | None]:
    try:
        t = yf.Ticker(symbol)
        price = None
        currency = None
        try:
            price = t.fast_info.get("last_price")
            currency = t.fast_info.get("currency")
        except Exception:
            pass

        if price is None:
            hist = t.history(period="1d")
            if not hist.empty:
                price = float(hist["Close"].iloc[-1])

        return (float(price) if price is not None else None), currency
    except Exception as e:
        print(f"Error consultando {symbol}: {e}")
        return None, None


def main() -> None:
    if not INDEX_PATH.exists():
        print("No existe data/index.json")
        return

    index_data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for entry in index_data.get("companies", []):
        ticker = entry.get("ticker")
        rel_file = entry.get("file") or f"data/companies/{ticker}.json"
        company_path = ROOT / rel_file
        if not company_path.exists():
            continue

        company = json.loads(company_path.read_text(encoding="utf-8"))
        price, currency = get_yahoo_price(ticker)
        if price is not None:
            company["price"] = price
            company["priceDate"] = today
            if currency and not company.get("currency"):
                company["currency"] = currency
            company_path.write_text(json.dumps(company, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"Actualizado {ticker}: {price} {company.get('currency', '')}")
        else:
            print(f"Sin precio disponible para {ticker}")


if __name__ == "__main__":
    main()
