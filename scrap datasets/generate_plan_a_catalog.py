import os
import pandas as pd
import json

def generate_thematic_catalog():
    base_dir = r"c:\Users\Pc\Desktop\scrap datasets"
    files = {
        "Valencia": "datasets catalogo valencia.csv",
        "Barcelona": "datasets catalogo barcelona.csv",
        "Madrid": "datasets catalogo Madrid.csv",
        "Espana": "datasets catalogo españa.csv",
        "Castilla_y_Leon": "datasets catalogo Castilla y leon.csv"
    }

    catalog = {}

    def get_column(df, possible_names):
        for name in possible_names:
            # check exact match
            if name in df.columns: return name
            # check case insensitive match
            for col in df.columns:
                if str(col).lower() == name.lower(): return col
        return None

    for region, filename in files.items():
        filepath = os.path.join(base_dir, filename)
        if not os.path.exists(filepath):
            continue
            
        print(f"Processing {region}...")
        catalog[region] = {}
        
        try:
            # Different reading logic based on region to avoid memory issues with Espana
            if region == "Espana":
                # Only read a sample or chunk it to avoid memory issues
                chunks = pd.read_csv(filepath, sep=';', encoding='latin1', on_bad_lines='skip', chunksize=50000, low_memory=False)
                for i, df in enumerate(chunks):
                    process_dataframe(df, region, catalog)
                    # We just process the first 3 chunks (150k max) to get a good sample of themes for Espana 
                    # as it's just for LLM brainstorming
                    if i >= 2: break 
            else:
                try:
                    df = pd.read_csv(filepath, sep=';', encoding='utf-8', on_bad_lines='skip')
                except:
                    try:
                        df = pd.read_csv(filepath, sep=',', encoding='utf-8', on_bad_lines='skip')
                    except:
                        df = pd.read_csv(filepath, sep=';', encoding='latin1', on_bad_lines='skip')
                
                process_dataframe(df, region, catalog)
                
        except Exception as e:
            print(f"Error processing {region}: {e}")

    # Format output for JSON
    final_output = {}
    for region, themes in catalog.items():
        final_output[region] = {}
        # Sort themes by volume to keep only the top ones for the LLM
        sorted_themes = sorted(themes.items(), key=lambda x: x[1]['vol'], reverse=True)
        
        # Keep top 15 themes per region to save tokens
        for theme_name, data in sorted_themes[:15]:
            if str(theme_name) == 'nan' or not str(theme_name).strip(): continue
            
            final_output[region][str(theme_name)] = {
                "vol": data["vol"],
                "fmt": list(data["fmt"])[:5], # top 5 formats
                "ej": list(data["ej"])[:4]    # 4 examples max
            }

    output_path = os.path.join(base_dir, "catalogo_tematico_llm.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(final_output, f, indent=2, ensure_ascii=False)
        
    print(f"Catalog saved to {output_path}")

def process_dataframe(df, region, catalog):
    # Find columns
    title_col = None
    theme_col = None
    fmt_col = None
    
    for col in df.columns:
        c_low = str(col).lower()
        if not title_col and any(x in c_low for x in ['titl', 'títul', 'name', 'nombre']):
            title_col = col
        if not theme_col and any(x in c_low for x in ['theme', 'tema', 'sector', 'tag', 'categor']):
            theme_col = col
        if not fmt_col and any(x in c_low for x in ['format', 'fmt', 'distrib']):
            fmt_col = col

    # If we couldn't find a theme col, create a "General" theme
    if not theme_col:
        df['_theme_filler'] = 'General'
        theme_col = '_theme_filler'
    if not title_col:
        # try to find first string column
        for col in df.columns:
            if df[col].dtype == 'object':
                title_col = col
                break

    if not title_col: return # Can't do much without titles

    # Drop NaNs in important cols
    df = df.dropna(subset=[title_col])
    
    for _, row in df.iterrows():
        # Get theme
        theme_val = str(row[theme_col]) if theme_col and pd.notna(row[theme_col]) else "Otros"
        # Split multiple themes if separated by comma
        themes = [t.strip() for t in theme_val.split(',')] if ',' in theme_val else [theme_val]
        
        title = str(row[title_col])
        fmt = str(row[fmt_col]) if fmt_col and pd.notna(row[fmt_col]) else "desc"
        fmt = fmt[:15] # Truncate to avoid huge messy strings if CSV parsing failed
        
        for t in themes:
            if t not in catalog[region]:
                catalog[region][t] = {"vol": 0, "fmt": set(), "ej": set()}
            
            catalog[region][t]["vol"] += 1
            if fmt != "desc" and len(catalog[region][t]["fmt"]) < 5:
                catalog[region][t]["fmt"].add(fmt)
                
            # Add example title if we don't have enough
            if len(catalog[region][t]["ej"]) < 4:
                # Basic cleaning of title to save tokens
                clean_title = title.replace('\n', ' ').strip()
                if len(clean_title) > 60: clean_title = clean_title[:57] + "..."
                catalog[region][t]["ej"].add(clean_title)

if __name__ == "__main__":
    generate_thematic_catalog()
