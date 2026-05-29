<template>
  <div
    class="flex flex-col gap-0.5 sm:gap-1 text-sm z-40"
    :class="[!poke?.visible && 'invisible', !isSingles ? 'w-16 sm:w-32' : 'w-28 sm:w-40']"
  >
    <div class="flex justify-between flex-col sm:flex-row gap-1">
      <div class="font-bold flex items-center grow overflow-hidden">
        <span class="truncate text-xs">{{ poke?.base?.name || "--" }}</span>
        <GenderIcon class="size-4 hidden sm:block" :gender />
      </div>
      <div class="flex items-center">
        <span class="text-[0.65rem] sm:text-xs whitespace-nowrap">
          Lv. {{ poke?.base?.level ?? 0 }}
        </span>
        <GenderIcon
          class="size-4 sm:hidden"
          :class="gender === 'N' && 'invisible'"
          :gender="gender === 'N' ? 'M' : gender"
        />
      </div>
    </div>
    <div class="relative overflow-hidden rounded-md bg-[#333] flex">
      <div class="hp-fill absolute h-full rounded-md" />
      <div
        class="w-full text-center text-gray-100 dark:text-highlighted text-[0.65rem] leading-4 sm:text-xs font-medium z-30"
      >
        {{ hpPercent }}%
      </div>
    </div>
    <div class="relative">
      <div
        v-if="poke"
        class="flex gap-1 flex-wrap absolute *:px-[0.2rem] *:py-[0.1rem] *:text-[0.6rem] *:leading-3 sm:*:text-xs"
      >
        <UBadge v-if="poke.v.transformed" color="neutral" label="Transformed" variant="subtle" />

        <UBadge
          v-if="poke.base.status"
          :color="statusColor[poke.base.status].color"
          :variant="statusColor[poke.base.status].variant"
          :label="poke.base.status.toUpperCase()"
        />

        <template v-if="!poke.v.species.types.every((ty, i) => ty === poke.v.types?.[i])">
          <TypeBadge v-for="type in poke.v.types" :key="type" :type />
        </template>

        <TypeBadge
          v-if="poke.v.charging"
          :type="poke.v.charging.move.type"
          :label="poke.v.charging.move.name"
        />

        <UBadge v-for="(props, i) in badges" :key="i" v-bind="props" />

        <template v-for="(val, stage) in poke.v.stages">
          <UBadge v-if="val" :key="stage" :color="val > 0 ? 'old-lime' : 'error'">
            {{
              roundTo(
                stage === "acc" || stage === "eva"
                  ? poke.base.gen.accStageMultipliers[val][0] /
                      poke.base.gen.accStageMultipliers[val][1]
                  : poke.base.gen.stageMultipliers[val][0] / poke.base.gen.stageMultipliers[val][1],
                2,
              )
            }}x {{ statShortName![stage] }}
          </UBadge>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {BadgeProps} from "@nuxt/ui";
import type {SpeciesId} from "~~/game/species";
import {VF} from "~~/game/utils";

const {poke} = defineProps<{poke?: ClientActivePokemon; isSingles: bool}>();

const hpPercent = computed(() => {
  const value = poke?.base?.hpPercent ?? 0;
  return value ? Math.min(Math.max(Math.round(value), 1), 100) : 0;
});

const statShortName = computed(
  () => poke && {...getStatKeys(poke.base.gen), spd: "SpD", acc: "Acc", eva: "Eva"},
);

const gender = computed(() => gen1Gender[poke?.v.speciesId as SpeciesId] ?? poke?.v.gender ?? "N");

// prettier-ignore
const badges = computed(() => {
  const result: BadgeProps[] = [];
  if (!poke) {
    return result;
  }

  if (poke.v.trapped) { result.push({color: "error", icon: "tabler:prison", label: poke.v.trapped.move.name, variant: "subtle"}); }
  if (poke.v.perishCount) { result.push({color: "error", icon: "material-symbols:skull", label: poke.v.perishCount, variant: "subtle"}); }
  if (poke.v.stockpile) { result.push({color: "old-lime", icon: "material-symbols-light:money-bag", label: poke.v.stockpile, variant: "subtle"}); }
  if (poke.v.hasFlag(VF.followMe)) { result.push({color: "old-lime", icon: "tabler:hand-finger", variant: "subtle"}); }
  if (poke.v.hasFlag(VF.snatch)) { result.push({color: "old-lime", icon: "tabler:hand-grab", variant: "subtle"}); }
  if (poke.v.attract) { result.push({color: "old-pink", icon: "material-symbols:favorite", variant: "subtle"}); }
  if (poke.v.hasFlag(VF.powerTrick)) { result.push({color: "old-pink", icon: "mi:switch", variant: "subtle"}); }
  if (poke.v.hasFlag(VF.lockon)) { result.push({color: "error", icon: "ri:crosshair-2-line", variant: "subtle"}); }
  if (poke.v.meanLook) { result.push({color: "error", icon: "tabler:prison", variant: "subtle"}); }
  if (poke.v.seededBy) { result.push({color: "old-lime", icon: "tabler:seedling-filled", variant: "subtle"}); }
  if (poke.v.hasFlag(VF.flashFire)) { result.push({color: "error", icon: "mdi:fire", variant: "subtle"}); }
  if (poke.v.hasFlag(VF.helpingHand)) { result.push({color: "old-lime", icon: "mdi:hand-clap", variant: "subtle"}); }
  if (poke.v.hasFlag(VF.charge)) { result.push({color: "old-yellow", icon: "material-symbols:bolt", variant: "subtle"}); }
  if (poke.v.hasFlag(VF.magicCoat)) { result.push({color: "old-pink", icon: "mdi:mirror", variant: "subtle"}); }
  if (poke.v.hasFlag(VF.gastroAcid)) { result.push({ color: "old-purple", icon: "material-symbols:block-outline", label: "Suppressed", variant: "subtle" }); }
  if (poke.v.encore) { result.push({color: "old-sky", icon: "material-symbols:celebration", variant: "subtle"}); }
  if (poke.v.disabled) { result.push({color: "error", icon: "material-symbols:block-outline", variant: "subtle"}); }
  if (poke.v.tauntTurns) { result.push({color: "error", icon: "fluent-emoji-high-contrast:anger-symbol", variant: "subtle"}); }
  if (poke.v.embargoTurns) { result.push({color: "error", icon: "tabler:truck-off", variant: "subtle"}); }
  if (poke.v.hasFlag(VF.torment)) { result.push({ color: "error", icon: "fluent-emoji-high-contrast:anger-symbol", variant: "subtle", label: "Torment" }); }
  if (poke.v.identified) { result.push({color: "old-violet", icon: "material-symbols:search-rounded", variant: "subtle"}); }
  if (poke.v.magnetRise) { result.push({color: "old-amber", icon: "tabler:magnet", variant: "subtle"}); }
  if (poke.v.hasFlag(VF.imprisoning)) { result.push({ color: "error", icon: "material-symbols:lock", variant: "subtle", label: "Imprisoning" }); }
  if (poke.v.hasFlag(VF.curse)) { result.push({color: "error", icon: "mdi:nail", label: "Cursed", variant: "subtle"}); }
  if (poke.v.hasFlag(VF.ingrain)) { result.push({color: "old-lime", icon: "tabler:prison", variant: "subtle", label: "Ingrain"}); }
  if (poke.v.hasFlag(VF.aquaRing)) { result.push({color: "old-sky", variant: "subtle", label: "Aqua Ring"}); }
  if (poke.v.hasFlag(VF.roost)) { result.push({color: "neutral", label: "Roost", icon: "mdi:feather", variant: "subtle"}); }
  if (poke.v.hasFlag(VF.focusEnergy)) { result.push({color: "old-emerald", label: "Focus Energy"}); }
  if (poke.v.hasFlag(VF.mist)) { result.push({color: "old-teal", label: "Mist"}); }
  if (poke.v.hasFlag(VF.destinyBond)) { result.push({color: "neutral", label: "Destiny Bond", variant: "subtle"}); }
  if (poke.v.hasFlag(VF.grudge)) { result.push({color: "neutral", label: "Grudge", variant: "subtle"}); }
  if (poke.v.hasFlag(VF.protect)) { result.push({color: "neutral", label: "Protect"}); }
  if (poke.v.hasFlag(VF.endure)) { result.push({color: "neutral", label: "Endure"}); }
  if (poke.v.hasFlag(VF.nightmare)) { result.push({color: "neutral", label: "Nightmare"}); }
  if (poke.v.drowsy) { result.push({color: "neutral", label: "Drowsy"}); }
  if (poke.v.hasFlag(VF.waterSport)) { result.push({color: "old-sky", label: "Water Sport"}); }
  if (poke.v.hasFlag(VF.mudSport)) { result.push({color: "old-orange", label: "Mud Sport"}); }

  return result;
});
</script>

<style scoped>
.hp-fill {
  width: v-bind("hpPercent + '%'");
  background-color: v-bind("hpColor(hpPercent)");
  transition: width 0.5s, background-color 0.5s;
}
</style>
