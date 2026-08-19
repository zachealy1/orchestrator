chrome.runtime.sendMessage({ type: "orchestrator-status" }, (response) => {
  document.querySelector("#status").textContent = response?.connected
    ? "Connected. Orchestrator can control only tabs you approve."
    : "Open Orchestrator and check Computer use settings to finish setup.";
});
