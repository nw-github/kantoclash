type Sprites = Record<string, { start: number; end: number }>;

export const useAudio = (sounds: Record<string, { src: string; sprites?: Sprites }>) => {
  const saved: Record<string, [AudioBuffer, Sprites | undefined]> = {};
  let context: AudioContext | undefined;

  onMounted(() => {
    context = new AudioContext();
    for (const name in sounds) {
      load(name, sounds[name].src, sounds[name].sprites);
    }
  });
  onUnmounted(() => context && context.close(), (context = undefined));

  const load = async (name: string, src: string, sprites?: Sprites) => {
    if (!context) {
      sounds[name] = { src, sprites };
      return;
    }

    const sound = await $fetch<Blob>(src, { method: "GET" });
    saved[name] = [await context.decodeAudioData(await sound.arrayBuffer()), sprites];
  };

  const play = (name: string, opts: { sprite?: string; volume?: number; detune?: number }) => {
    const audio = saved[name];
    if (!context || !audio) {
      return;
    }

    let offset = undefined;
    let duration = undefined;
    const sheet = audio[1];
    if (sheet && opts.sprite) {
      offset = sheet[opts.sprite].start;
      duration = sheet[opts.sprite].end - sheet[opts.sprite].start;
    }

    const gain = context.createGain();
    gain.gain.value = opts.volume ?? 1;
    gain.connect(context.destination);

    const source = context.createBufferSource();
    source.buffer = audio[0];
    source.detune.value = opts.detune ?? 0;
    source.connect(gain);
    return new Promise(resolve => {
      source.onended = resolve;
      source.start(0, offset, duration);
    });
  };

  return { load, play };
};
