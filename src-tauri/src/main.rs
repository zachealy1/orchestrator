// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let mut arguments = std::env::args_os();
    let _ = arguments.next();
    if arguments.next().as_deref() == Some(std::ffi::OsStr::new("--browser-native-host")) {
        let Some(config_path) = arguments.next() else {
            std::process::exit(2);
        };
        if let Err(error) =
            orchestrator_lib::run_browser_native_host(std::path::Path::new(&config_path))
        {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    orchestrator_lib::run()
}
