#!/usr/bin/env python3
"""
Check if map preprocessing needs to be run based on file timestamps.
Automatically regenerates binary grid and POI CSV when the source map is newer.
"""
import os
import sys
import subprocess
from pathlib import Path

def needs_regeneration(source_path, output_paths):
    """Check if source is newer than any of the outputs."""
    if not os.path.exists(source_path):
        print(f"Error: Source file {source_path} not found")
        return False
    
    source_mtime = os.path.getmtime(source_path)
    
    for output_path in output_paths:
        if not os.path.exists(output_path):
            print(f"Output {output_path} doesn't exist - regeneration needed")
            return True
        
        output_mtime = os.path.getmtime(output_path)
        if source_mtime > output_mtime:
            print(f"Source {source_path} is newer than {output_path} - regeneration needed")
            return True
    
    return False

def main():
    # Define paths relative to project root
    project_root = Path(__file__).parent.parent
    
    map_file = project_root / "maps" / "middle_earth.worldmap"
    binary_output = project_root / "maps" / "middle_earth_regions.bin"
    poi_output = project_root / "maps" / "middle_earth_pois.csv"
    preprocessing_script = project_root / "scripts" / "map_preprocessing.py"
    
    # Check if any preprocessing module has changed
    preprocessing_modules = [
        project_root / "scripts" / "map_preprocessing.py",
        project_root / "scripts" / "geo_features_preprocessing.py",
        project_root / "scripts" / "mountain_depth_preprocessing.py"
    ]
    
    # Get the newest modification time among all preprocessing modules
    newest_module_time = 0
    for module in preprocessing_modules:
        if module.exists():
            newest_module_time = max(newest_module_time, module.stat().st_mtime)
    
    # Check if regeneration is needed
    outputs = [binary_output, poi_output]
    needs_regen = needs_regeneration(map_file, outputs)
    
    # Also check if any preprocessing module is newer than outputs
    if not needs_regen:
        for output in outputs:
            if output.exists() and newest_module_time > output.stat().st_mtime:
                print(f"Preprocessing module changed - regeneration needed")
                needs_regen = True
                break
    
    if needs_regen:
        print("Running map preprocessing...")
        cmd = [
            sys.executable,
            str(preprocessing_script),
            str(map_file),
            str(binary_output),
            str(poi_output)
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                print("Preprocessing completed successfully")
                print(result.stdout)
            else:
                print("Preprocessing failed!")
                print(result.stderr)
                sys.exit(1)
        except Exception as e:
            print(f"Error running preprocessing: {e}")
            sys.exit(1)
    else:
        print("Map data is up to date - no regeneration needed")

if __name__ == "__main__":
    main()