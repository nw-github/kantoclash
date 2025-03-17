type Sprites = Record<string, { start: number; end: number }>;

let context: AudioContext | undefined;

const unlock = () => {
  if (context) {
    document.removeEventListener("touchstart", unlock, true);
    document.removeEventListener("touchend", unlock, true);
    document.removeEventListener("click", unlock, true);
    document.removeEventListener("keydown", unlock, true);

    context.resume().catch(() => {});
  }
};

export const useAudioContext = () => {
  if (import.meta.client && !context) {
    context = new AudioContext();
    context.suspend();

    document.addEventListener("touchstart", unlock, true);
    document.addEventListener("touchend", unlock, true);
    document.addEventListener("click", unlock, true);
    document.addEventListener("keydown", unlock, true);
  }

  return context;
};

export const useAudio = (sounds: Record<string, { src: string; sprites?: Sprites }>) => {
  const saved: Record<string, [AudioBuffer, Sprites | undefined]> = {};
  const context = useAudioContext();

  onMounted(() => {
    for (const name in sounds) {
      load(name, sounds[name].src, sounds[name].sprites);
    }
  });

  const load = async (name: string, src: string, sprites?: Sprites) => {
    if (!context) {
      sounds[name] = { src, sprites };
      return;
    }

    const sound = await $fetch<Blob>(src, { method: "GET" }).then(s => s.arrayBuffer());
    saved[name] = [await context.decodeAudioData(sound), sprites];
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
    return new Promise<void>(resolve => {
      source.onended = resolve as () => void;
      source.start(0, offset, duration);
    });
  };

  return { load, play };
};
