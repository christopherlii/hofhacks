async function initConfigStore(): Promise<any> {
  const { default: Store } = await import('electron-store');
  return new Store({
    name: 'enk-config',
    schema: {
      anthropicKey: { type: 'string', default: '' },
      niaKey: { type: 'string', default: '' },
      enabled: { type: 'boolean', default: true },
      scamDetection: { type: 'boolean', default: true },
      firstLaunch: { type: 'boolean', default: true },
    },
    encryptionKey: 'enk-secure-storage-key-v1'
  });
}

export { initConfigStore };
