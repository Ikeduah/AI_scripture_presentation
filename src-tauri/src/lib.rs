use keyring::Entry;

#[tauri::command]
fn set_secure_key(key: String, value: String) -> Result<(), String> {
    let entry = Entry::new("VerseSense", &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_secure_key(key: String) -> Result<String, String> {
    let entry = Entry::new("VerseSense", &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(val) => Ok(val),
        Err(keyring::Error::NoEntry) => Ok("".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn delete_secure_key(key: String) -> Result<(), String> {
    let entry = Entry::new("VerseSense", &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
        set_secure_key,
        get_secure_key,
        delete_secure_key
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
