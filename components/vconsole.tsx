'use client';
import Script from 'next/script';
import React, { useEffect } from 'react';

type VConsoleWindow = Window & {
  VConsole?: new () => { destroy?: () => void };
  __sastPeopleVConsole?: { destroy?: () => void };
};

export const VConsole = () => {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_VCONSOLE === 'true';

  useEffect(() => {
    if (enabled) return;

    const currentWindow = window as VConsoleWindow;
    currentWindow.__sastPeopleVConsole?.destroy?.();
    currentWindow.__sastPeopleVConsole = undefined;
    document
      .querySelectorAll('.vc-switch, .vc-mask, .vc-panel')
      .forEach((element) => element.remove());
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      {process.env.NODE_ENV === 'production' ? (
        <></>
      ) : (
        <>
          <Script
            src="https://unpkg.com/vconsole@latest/dist/vconsole.min.js"
            strategy="afterInteractive"
            onLoad={() => {
              const currentWindow = window as VConsoleWindow;
              if (
                currentWindow.__sastPeopleVConsole ||
                typeof currentWindow.VConsole !== 'function'
              ) {
                return;
              }
              currentWindow.__sastPeopleVConsole = new currentWindow.VConsole();
            }}
          />
        </>
      )}
    </>
  );
};
