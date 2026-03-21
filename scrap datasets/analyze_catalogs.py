import os
import pandas as pd
import json
import traceback

def safe_read_csv(filepath, sep=None, encoding='utf-8'):
    if sep is None:
        try:
            return pd.read_csv(filepath, encoding=encoding, sep=sep, on_bad_lines='skip', engine='python')
        except:
            return pd.read_csv(filepath, encoding=encoding, sep=';', on_bad_lines='skip', engine='python')
    else:
        return pd.read_csv(filepath, encoding=encoding, sep=sep, on_bad_lines='skip', engine='python')

def process_catalogs():
    base_dir = r"c:\Users\Pc\Desktop\scrap datasets"
    files = {
        "usa": "datasets catalogo barcelona.csv", # Note: Barcelona was checked
        "valencia": "datasets catalogo valencia.csv",
        "madrid": "datasets catalogo Madrid.csv",
        "espana": "datasets catalogo españa.csv",
        "castilla_y_leon": "datasets catalogo Castilla y leon.csv",
        #"la_rioja": "datasets catalogo La rioja.xml" # XML skip for now or parse separately
    }
    
    summary = {
        "metrics": {},
        "top_themes": {},
        "formats_distribution": {},
        "datasets_sample": []
    }
    
    # 1. Valencia
    try:
        df_val = safe_read_csv(os.path.join(base_dir, files['valencia']), sep=';', encoding='utf-8')
        summary['metrics']['Valencia'] = len(df_val)
        if 'default.theme' in df_val.columns:
            themes = df_val['default.theme'].dropna().str.split(',').explode().str.strip()
            summary['top_themes']['Valencia'] = themes.value_counts().head(10).to_dict()
    except Exception as e:
        print(f"Error Valencia: {e}")

    # 2. Barcelona
    try:
        df_bcn = safe_read_csv(os.path.join(base_dir, files['usa']), sep=',', encoding='utf-8') # its named barcelona
        summary['metrics']['Barcelona'] = len(df_bcn)
        if 'tags_list' in df_bcn.columns:
            themes = df_bcn['tags_list'].dropna().str.split(',').explode().str.strip()
            summary['top_themes']['Barcelona'] = themes.value_counts().head(10).to_dict()
    except Exception as e:
        print(f"Error Barcelona: {e}")

    # 3. Madrid
    try:
        df_mad = safe_read_csv(os.path.join(base_dir, files['madrid']), sep=';', encoding='latin1')
        summary['metrics']['Madrid'] = len(df_mad)
        # Guesses based on standard es catalogs
        if 'Sector' in df_mad.columns:
            themes = df_mad['Sector'].dropna().str.split(',').explode().str.strip()
            summary['top_themes']['Madrid'] = themes.value_counts().head(10).to_dict()
    except Exception as e:
        print(f"Error Madrid: {e}")
        
    # 4. Castilla y Leon
    try:
        df_cyl = safe_read_csv(os.path.join(base_dir, files['castilla_y_leon']), sep=';', encoding='latin1')
        summary['metrics']['Castilla_y_Leon'] = len(df_cyl)
    except Exception as e:
        print(f"Error Castilla y Leon: {e}")

    # 5. España (huge file, chunking it)
    esp_path = os.path.join(base_dir, files['espana'])
    esp_count = 0
    esp_themes = {}
    try:
        # It's a huge CSV, might have weird encoding, let's try latin1 and ; separator
        chunksize = 100000
        for chunk in pd.read_csv(esp_path, sep=';', encoding='utf-8', on_bad_lines='skip', chunksize=chunksize, low_memory=False):
            esp_count += len(chunk)
            # Just count for now
    except Exception as e:
        print(f"Esp UTF-8 failed, trying latin1: {e}")
        try:
            for chunk in pd.read_csv(esp_path, sep=';', encoding='latin1', on_bad_lines='skip', chunksize=chunksize, engine='python'):
                esp_count += len(chunk)
        except Exception as e2:
            print(f"Esp latin1 failed: {e2}")

    summary['metrics']['Espana'] = esp_count
    
    with open(os.path.join(base_dir, "local_catalogs_summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=4, ensure_ascii=False)
        
    print("Catalog summary generated at local_catalogs_summary.json")

if __name__ == "__main__":
    process_catalogs()
