import { useEffect, useState } from 'react';

const YANDEX_DISK_DOWNLOAD_API = 'https://cloud-api.yandex.net/v1/disk/public/resources/download';
const yandexAssetUrlCache = new Map();

function assetCacheKey(publicKey, path) {
  return JSON.stringify([publicKey, path]);
}

export function resolveYandexAssetUrl(publicKey, path) {
  if (!path) return Promise.resolve('');
  const cacheKey = assetCacheKey(publicKey, path);
  const cached = yandexAssetUrlCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached.request;

  const endpoint = new URL(YANDEX_DISK_DOWNLOAD_API);
  endpoint.searchParams.set('public_key', publicKey);
  endpoint.searchParams.set('path', path);
  const request = fetch(endpoint)
    .then((response) => {
      if (!response.ok) throw new Error(`Yandex Disk request failed: ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      if (!payload.href) throw new Error(`Yandex Disk did not return an asset URL for ${path}`);
      return payload.href;
    })
    .catch((error) => {
      if (yandexAssetUrlCache.get(cacheKey)?.request === request) yandexAssetUrlCache.delete(cacheKey);
      throw error;
    });
  yandexAssetUrlCache.set(cacheKey, { request, expiresAt: Date.now() + 5 * 60 * 1000 });
  return request;
}

export function useYandexAsset(publicKey, path) {
  const [asset, setAsset] = useState({ publicKey: '', path: '', url: '' });

  useEffect(() => {
    let isActive = true;
    setAsset({ publicKey, path, url: '' });
    resolveYandexAssetUrl(publicKey, path)
      .then((nextUrl) => {
        if (isActive) setAsset({ publicKey, path, url: nextUrl });
      })
      .catch(() => {
        if (isActive) setAsset({ publicKey, path, url: '' });
      });
    return () => {
      isActive = false;
    };
  }, [publicKey, path]);

  return asset.publicKey === publicKey && asset.path === path ? asset.url : '';
}

export function useYandexBlobAsset(publicKey, path) {
  const [asset, setAsset] = useState({ publicKey: '', path: '', url: '' });

  useEffect(() => {
    let isActive = true;
    let objectUrl = '';
    setAsset({ publicKey, path, url: '' });
    resolveYandexAssetUrl(publicKey, path)
      .then((assetUrl) => fetch(assetUrl, { referrerPolicy: 'no-referrer' }))
      .then((response) => {
        if (!response.ok) throw new Error(`Yandex asset request failed: ${response.status}`);
        return response.blob();
      })
      .then((file) => {
        if (!isActive) return;
        objectUrl = URL.createObjectURL(file);
        setAsset({ publicKey, path, url: objectUrl });
      })
      .catch(() => {
        if (isActive) setAsset({ publicKey, path, url: '' });
      });
    return () => {
      isActive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [publicKey, path]);

  return asset.publicKey === publicKey && asset.path === path ? asset.url : '';
}
