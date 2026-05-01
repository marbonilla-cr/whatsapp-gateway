declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (opts: { appId: string; version: string; cookie?: boolean; xfbml?: boolean }) => void;
    };
  }
}

/**
 * Loads the Facebook JS SDK once. Used for Embedded Signup / FB.login patterns.
 */
export function loadFacebookSdk(appId: string): Promise<typeof window.FB> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('document is not available'));
      return;
    }
    if (window.FB) {
      resolve(window.FB);
      return;
    }
    const existing = document.getElementById('facebook-jssdk');
    if (existing) {
      const check = () => {
        if (window.FB) resolve(window.FB);
        else setTimeout(check, 50);
      };
      check();
      return;
    }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, version: 'v22.0', cookie: true, xfbml: true });
      if (window.FB) resolve(window.FB);
      else reject(new Error('FB SDK failed to initialize'));
    };
    const js = document.createElement('script');
    js.id = 'facebook-jssdk';
    js.async = true;
    js.src = 'https://connect.facebook.net/en_US/sdk.js';
    js.onerror = () => reject(new Error('Failed to load Facebook SDK'));
    document.body.appendChild(js);
  });
}
