//! Native spelling defaults for macOS WebKit text inputs.
use objc2_foundation::{ns_string, NSDictionary, NSNumber, NSUserDefaults};

pub(crate) fn register_defaults() {
    let enabled = NSNumber::numberWithBool(true);
    let defaults = NSDictionary::from_slices(
        &[ns_string!("WebContinuousSpellCheckingEnabled")],
        &[enabled.as_ref()],
    );

    // WebKit caches this preference when its text checker first initializes:
    // https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/mac/TextCheckerMac.mm
    // Register before creating any webview. Registration supplies a fallback
    // without overwriting explicit preferences or NSAllowContinuousSpellChecking.
    // SAFETY: The dictionary contains an NSString key and an NSNumber boolean,
    // both valid property-list types for NSUserDefaults.
    unsafe { NSUserDefaults::standardUserDefaults().registerDefaults(&defaults) };
}
