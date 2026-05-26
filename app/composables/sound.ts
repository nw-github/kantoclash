let context: (AudioContext & {unlocked?: bool}) | undefined;
const onUnlocks: (() => void)[] = [];

let dummyAudio: AudioBuffer | undefined;

const unlock = () => {
  if (context) {
    document.removeEventListener("touchstart", unlock, true);
    document.removeEventListener("touchend", unlock, true);
    document.removeEventListener("click", unlock, true);
    document.removeEventListener("keydown", unlock, true);

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(context.destination);

    const source = context.createBufferSource();
    source.buffer = dummyAudio!;
    source.connect(gain);
    source.start();
    context.resume().catch(() => {});

    context.unlocked = true;
    onUnlocks.forEach(f => f());

    console.log("unlocked audio context");
  }
};

export const useAudioContext = (onUnlock?: () => void) => {
  if (import.meta.client && !context) {
    context = new AudioContext();
    (async () => {
      const sound = await $fetch<Blob>("/silence.mp3", {method: "GET"}).then(s => s.arrayBuffer());
      dummyAudio = await context.decodeAudioData(sound);

      document.addEventListener("touchstart", unlock, true);
      document.addEventListener("touchend", unlock, true);
      document.addEventListener("click", unlock, true);
      document.addEventListener("keydown", unlock, true);
    })();
  }

  if (onUnlock) {
    onUnlocks.push(onUnlock);
  }
  return context;
};

type Sprites = Record<string, {start: number; end: number}>;

export const useAudio = (sounds: Record<string, {src: string; sprites?: Sprites}>) => {
  const saved: Record<string, [AudioBuffer, Sprites | undefined]> = {};
  const context = useAudioContext();
  const playing: [AudioBufferSourceNode, () => void][] = [];
  let mounted = false;

  const loading: Partial<Record<string, Promise<void>>> = {};
  onMounted(() => {
    for (const name in sounds) {
      load(name, sounds[name].src, sounds[name].sprites);
    }

    mounted = true;
  });

  onUnmounted(() => {
    stopAll();
    mounted = false;
  });

  const load = (name: string, src: string, sprites?: Sprites) => {
    if (!context) {
      sounds[name] = {src, sprites};
      return;
    }

    const doLoad = async () => {
      const sound = await $fetch<Blob>(src, {method: "GET"}).then(s => s.arrayBuffer());
      saved[name] = [await context.decodeAudioData(sound), sprites];
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete loading[name];
    };

    return (loading[name] = doLoad());
  };

  const play = async (name: string, opts: {sprite?: string; volume?: number; detune?: number}) => {
    const promise = loading[name];
    if (promise) {
      await promise;
    }

    const audio = saved[name];
    if (!context || !context.unlocked || !audio || !mounted) {
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
      const onEnded = () => {
        const idx = playing.findIndex(s => s[0] === source);
        if (idx !== -1) {
          playing.splice(idx, 1);
          resolve();
        }
      };

      playing.push([source, onEnded]);
      source.onended = onEnded;
      source.start(0, offset, duration);
    });
  };

  const stopAll = () => {
    for (const [item, cb] of playing.splice(0, playing.length)) {
      item.stop();
      cb();
    }
  };

  return {load, play, stopAll};
};
