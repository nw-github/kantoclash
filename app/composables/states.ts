import type {Challenge} from "~~/server/gameServer";
import type {Team} from "~/utils/pokemon";

export const useMyId = () => {
  const {user} = useUserSession();
  return computed(() => user.value?.id ?? "");
};

export const useMyTeams = () => {
  const teams = useLocalStorage<Team[]>("myTeams", () => []);
  for (const team of teams.value) {
    for (const poke of team.pokemon) {
      // Legacy: all SpeciesId/string fields named 'species' were renamed to 'speciesId'
      if ("species" in poke) {
        poke.speciesId = poke.species as any;
        delete poke.species;
      }
    }
  }
  return teams;
};

export const allMusicTracks = Object.keys(import.meta.glob("~~/public/music/**/*.{mp3,wav,ogg}"));

export const femaleIds = new Set(
  Object.keys(import.meta.glob("~~/public/sprites/battle/female/*.gif")).map(spr =>
    spr.slice(spr.lastIndexOf("/") + 1, spr.lastIndexOf(".")),
  ),
);

export const useSfxVolume = () => useLocalStorage("sfxVolume", 0.4);

const fadeOutRequested = ref(false);

export const useBGMusic = () => {
  return {
    volume: useLocalStorage("musicVolume", 0.4),
    track: useState<string | undefined>("currentTrack", () => undefined),
    fadeOutRequested,
    fadeOut: () => void (fadeOutRequested.value = true),
  };
};

export const useMutedPlayerIds = () => useLocalStorage<string[]>("mutedPlayers", []);

export const useChatCensorEnabled = () => useLocalStorage<bool>("profanity", true);

export const useIgnoreChallenges = () => useLocalStorage<bool>("ignoreChallenges", false);

export const useAutoMuteMusic = () => useLocalStorage<bool>("autoMuteMusic", false);

export const useChallenges = () => useState<Challenge[]>("challenges", () => []);

const touchFocus = ref<HTMLElement>();

export const useTouchedElement = () => touchFocus;
