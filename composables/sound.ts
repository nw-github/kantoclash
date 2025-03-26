type Sprites = Record<string, {start: number; end: number}>;

let context: (AudioContext & {unlocked?: boolean}) | undefined;
const onUnlocks: (() => void)[] = [];

const unlock = () => {
  if (context) {
    document.removeEventListener("touchstart", unlock, true);
    document.removeEventListener("touchend", unlock, true);
    document.removeEventListener("click", unlock, true);
    document.removeEventListener("keydown", unlock, true);

    context.resume().catch(() => {});

    context.unlocked = true;
    onUnlocks.forEach(f => f());

    console.log("unlocked audio context");
  }
};

export const useAudioContext = (onUnlock?: () => void) => {
  if (import.meta.client && !context) {
    context = new AudioContext();
    document.addEventListener("touchstart", unlock, true);
    document.addEventListener("touchend", unlock, true);
    document.addEventListener("click", unlock, true);
    document.addEventListener("keydown", unlock, true);
  }

  if (onUnlock) {
    onUnlocks.push(onUnlock);
  }
  return context;
};

export const useAudio = (sounds: Record<string, {src: string; sprites?: Sprites}>) => {
  const saved: Record<string, [AudioBuffer, Sprites | undefined]> = {};
  const context = useAudioContext();
  const playing: AudioBufferSourceNode[] = [];
  let mounted = false;

  onMounted(() => {
    for (const name in sounds) {
      load(name, sounds[name].src, sounds[name].sprites);
    }

    mounted = true;
  });

  onUnmounted(() => {
    for (const item of playing.splice(0, playing.length)) {
      item.stop();
    }

    mounted = false;
  });

  const load = async (name: string, src: string, sprites?: Sprites) => {
    if (!context) {
      sounds[name] = {src, sprites};
      return;
    }

    const sound = await $fetch<Blob>(src, {method: "GET"}).then(s => s.arrayBuffer());
    saved[name] = [await context.decodeAudioData(sound), sprites];
  };

  const play = (name: string, opts: {sprite?: string; volume?: number; detune?: number}) => {
    const audio = saved[name];
    if (!context || !audio || !mounted) {
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
      playing.push(source);
      source.onended = () => {
        playing.splice(playing.indexOf(source), 1);
        resolve();
      };
      source.start(0, offset, duration);
    });
  };

  return {load, play};
};
