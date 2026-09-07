fn main() {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("Usage: verify-codex-engine EXECUTABLE VERSION");
        std::process::exit(2);
    }
    if let Err(error) =
        orchestrator_lib::verify_codex_engine(std::path::Path::new(&args[1]), &args[2])
    {
        eprintln!("{error}");
        std::process::exit(1);
    }
    println!(
        "Codex {} passed Orchestrator's compatibility checks.",
        args[2]
    );
}
