use base64::Engine;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 3 {
        return Err("Usage: verify-update-signature PACKAGE SIGNATURE_FILE; requires ORCHESTRATOR_UPDATER_PUBLIC_KEY".into());
    }
    let decode = |text: &str| -> Result<String, Box<dyn std::error::Error>> {
        Ok(String::from_utf8(
            base64::engine::general_purpose::STANDARD.decode(text.trim())?,
        )?)
    };
    let key = minisign_verify::PublicKey::decode(&decode(&std::env::var(
        "ORCHESTRATOR_UPDATER_PUBLIC_KEY",
    )?)?)?;
    let signature =
        minisign_verify::Signature::decode(&decode(&std::fs::read_to_string(&args[2])?)?)?;
    key.verify(&std::fs::read(&args[1])?, &signature, true)?;
    println!("Updater package signature verified against the embedded release key.");
    Ok(())
}
