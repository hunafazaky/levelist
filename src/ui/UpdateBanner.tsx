import { pwa, usePwaState } from "../pwa/state";

/** Tells the person when a new version is waiting, or that the app can now work offline. */
export function UpdateBanner() {
  const { updateReady, offlineReady } = usePwaState();

  if (updateReady) {
    return (
      <div className="notice" role="status">
        <p>A new version is ready.</p>
        <div className="actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => pwa.applyUpdate()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
  if (offlineReady) {
    return (
      <div className="notice" role="status">
        <p>Saved for offline use. The app now works without a connection.</p>
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => pwa.dismissOfflineReady()}
          >
            OK
          </button>
        </div>
      </div>
    );
  }
  return null;
}
