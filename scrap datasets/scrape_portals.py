import requests
from bs4 import BeautifulSoup
import json
import os
import re
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def scrape_portals():
    results = {
        "Catalunya": {"url": "https://analisi.transparenciacatalunya.cat/?sortBy=relevance&page=1&pageSize=20", "total_datasets": "N/A", "themes_or_highlights": []},
        "Comunidad Valenciana": {"url": "https://dadesobertes.gva.es/dataset?q=&sort=views_recent+desc", "total_datasets": "N/A", "themes_or_highlights": []},
        "Alicante": {"url": "https://datosabiertos.alicante.es/?q=search/type/dataset", "total_datasets": "N/A", "themes_or_highlights": []},
        "Region de Murcia": {"url": "https://datosabiertos.regiondemurcia.es/catalogo.html", "total_datasets": "N/A", "themes_or_highlights": []},
        "Datos de Espana": {"url": "https://datos.gob.es/es/catalogo/conjuntos-datos", "total_datasets": "87250", "themes_or_highlights": ["Sector publico", "Economia", "Sociedad", "Medio ambiente"]},
        "Andalucia": {"url": "https://www.juntadeandalucia.es/datosabiertos/portal/dataset", "total_datasets": "N/A", "themes_or_highlights": []}
    }
    
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    
    # Catalunya
    try:
        r = requests.get(results["Catalunya"]["url"], headers=headers, timeout=10, verify=False)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, "html.parser")
            # Find elements with 'dataset' or counting titles
            titles = soup.find_all("h2")
            results["Catalunya"]["themes_or_highlights"] = [t.text.strip() for t in titles if t.text.strip()][:5]
    except Exception as e:
        results["Catalunya"]["error"] = str(e)
        
    # Comunidad Valenciana
    try:
        r = requests.get(results["Comunidad Valenciana"]["url"], headers=headers, timeout=10, verify=False)
        soup = BeautifulSoup(r.text, "html.parser")
        titles = soup.find_all("h3", class_="dataset-heading")
        results["Comunidad Valenciana"]["themes_or_highlights"] = [t.text.strip() for t in titles][:5]
        # try to find count
        count_elem = soup.find("h1")
        if count_elem:
            matches = re.findall(r'\d+', count_elem.text.replace('.', '').replace(',', ''))
            if matches:
                results["Comunidad Valenciana"]["total_datasets"] = matches[0]
    except Exception as e:
        results["Comunidad Valenciana"]["error"] = str(e)

    # Alicante
    try:
        r = requests.get("https://datosabiertos.alicante.es/dataset", headers=headers, timeout=10, verify=False)
        soup = BeautifulSoup(r.text, "html.parser")
        titles = soup.find_all("h3", class_="dataset-heading")
        results["Alicante"]["themes_or_highlights"] = [t.text.strip() for t in titles][:5]
        count_elem = soup.find("div", class_="new-results")
        if count_elem:
            matches = re.findall(r'\d+', count_elem.text)
            if matches:
                results["Alicante"]["total_datasets"] = matches[0]
    except Exception as e:
        results["Alicante"]["error"] = str(e)
        
    # Murcia
    try:
        r = requests.get(results["Region de Murcia"]["url"], headers=headers, timeout=10, verify=False)
        soup = BeautifulSoup(r.text, "html.parser")
        titles = soup.find_all("h4")
        results["Region de Murcia"]["themes_or_highlights"] = [t.text.strip() for t in titles if "..." not in t.text][:5]
    except Exception as e:
        results["Region de Murcia"]["error"] = str(e)
        
    # Andalucia
    try:
        r = requests.get(results["Andalucia"]["url"], headers=headers, timeout=10, verify=False)
        soup = BeautifulSoup(r.text, "html.parser")
        titles = soup.find_all("h3", class_="dataset-heading")
        results["Andalucia"]["themes_or_highlights"] = [t.text.strip() for t in titles][:5]
    except Exception as e:
        results["Andalucia"]["error"] = str(e)
        
    base_dir = r"c:\Users\Pc\Desktop\scrap datasets"
    with open(os.path.join(base_dir, "scraped_portals_summary.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=4, ensure_ascii=False)
        
    print("Scraping completed. Saved to scraped_portals_summary.json")

if __name__ == "__main__":
    scrape_portals()
