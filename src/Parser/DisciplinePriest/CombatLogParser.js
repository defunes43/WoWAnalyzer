import React from 'react';

import SPELLS from 'common/SPELLS';
import SpellLink from 'common/SpellLink';
import SpellIcon from 'common/SpellIcon';
import Icon from 'common/Icon';
import ITEMS from 'common/ITEMS';

import StatisticBox from 'Main/StatisticBox';
import ExpandableStatisticBox from 'Main/ExpandableStatisticBox';
import SuggestionsTab from 'Main/SuggestionsTab';
import TalentsTab from 'Main/TalentsTab';
import CastEfficiencyTab from 'Main/CastEfficiencyTab';
import CooldownsTab from 'Main/CooldownsTab';
import ManaTab from 'Main/ManaTab';

import MainCombatLogParser from 'Parser/Core/CombatLogParser';
import getCastEfficiency from 'Parser/Core/getCastEfficiency';
import ISSUE_IMPORTANCE from 'Parser/Core/ISSUE_IMPORTANCE';

import AbilityTracker from './Modules/Core/AbilityTracker';

import AlwaysBeCasting from './Modules/Features/AlwaysBeCasting';
import CooldownTracker from './Modules/Features/CooldownTracker';
import PowerWordShieldWasted from './Modules/Features/PowerWordShieldWasted';
import AtonementSource from './Modules/Features/AtonementSource';

import Tier19_2set from './Modules/Items/Tier19_2set';
import CordOfMaiev from './Modules/Items/CordOfMaiev';
import Skjoldr from './Modules/Items/Skjoldr';
import Xalan from './Modules/Items/Xalan';
import NeroBandOfPromises from './Modules/Items/NeroBandOfPromises';
import TarnishedSentinelMedallion from './Modules/Items/TarnishedSentinelMedallion';
import MarchOfTheLegion from './Modules/Items/MarchOfTheLegion';

import TwistOfFate from './Modules/Spells/TwistOfFate';
import Atonement from './Modules/Spells/Atonement';
import Evangelism from './Modules/Spells/Evangelism';

import CPM_ABILITIES, { SPELL_CATEGORY } from './CPM_ABILITIES';
import { ABILITIES_AFFECTED_BY_HEALING_INCREASES } from './Constants';

function formatThousands(number) {
  return (Math.round(number || 0) + '').replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");
}
function formatNumber(number) {
  if (number > 1000000) {
    return `${(number / 1000000).toFixed(2)}m`;
  }
  if (number > 10000) {
    return `${Math.round(number / 1000)}k`;
  }
  return formatThousands(number);
}
function getIssueImportance(value, regular, major, higherIsWorse = false) {
  if (higherIsWorse ? value > major : value < major) {
    return ISSUE_IMPORTANCE.MAJOR;
  }
  if (higherIsWorse ? value > regular : value < regular) {
    return ISSUE_IMPORTANCE.REGULAR;
  }
  return ISSUE_IMPORTANCE.MINOR;
}
function formatPercentage(percentage) {
  return (Math.round((percentage || 0) * 10000) / 100).toFixed(2);
}

class CombatLogParser extends MainCombatLogParser {
  static abilitiesAffectedByHealingIncreases = ABILITIES_AFFECTED_BY_HEALING_INCREASES;

  static specModules = {
    // Override the ability tracker so we also get stats for IoL and beacon healing
    abilityTracker: AbilityTracker,

    // Abilities
    alwaysBeCasting: AlwaysBeCasting,
    cooldownTracker: CooldownTracker,
    powerWordShieldWasted: PowerWordShieldWasted,
    atonementSource: AtonementSource,

    // Items:
    tier19_2set: Tier19_2set,
    cordOfMaiev: CordOfMaiev,
    skjoldr: Skjoldr,
    xalan: Xalan,
    neroBandOfPromises: NeroBandOfPromises,
    tarnishedSentinelMedallion: TarnishedSentinelMedallion,
    marchOfTheLegion: MarchOfTheLegion,


    // Spells (talents and traits):
    twistOfFate: TwistOfFate,
    atonement: Atonement,
    evangelism: Evangelism,
  };

  generateResults() {
    const results = super.generateResults();

    const fightDuration = this.fightDuration;

    const abilityTracker = this.modules.abilityTracker;
    const getAbility = spellId => abilityTracker.getAbility(spellId);

    const penance = getAbility(SPELLS.PENANCE.id);

    const hasCastigation = this.selectedCombatant.hasTalent(SPELLS.CASTIGATION_TALENT.id);
    const missedPenanceTicks = (this.modules.alwaysBeCasting.truePenanceCasts * (3 + (hasCastigation ? 1 : 0))) - (penance.casts || 0);
    const deadTimePercentage = this.modules.alwaysBeCasting.totalTimeWasted / fightDuration;
    const owlHealingPercentage = this.modules.tarnishedSentinelMedallion.healing / this.totalHealing;
    const marchHealingPercentage = this.modules.marchOfTheLegion.healing / this.totalHealing;
    const improperAtonementRefreshPercentage = this.modules.atonement.improperAtonementRefreshes.length / this.modules.atonement.totalAtones;

    const tier19_2setHealingPercentage = this.modules.tier19_2set.healing / this.totalHealing;


    if (improperAtonementRefreshPercentage > .05) {
      results.addIssue({
        issue: <span>Your <SpellLink id={SPELLS.ATONEMENT_HEAL_NON_CRIT.id} /> efficiency can be improved ({this.modules.atonement.improperAtonementRefreshes.length}/{this.modules.atonement.totalAtones} applications: {(improperAtonementRefreshPercentage * 100).toFixed(2)}% applied to already buffed players.)</span>,
        icon: SPELLS.ATONEMENT_HEAL_NON_CRIT.icon,
        importance: getIssueImportance(improperAtonementRefreshPercentage, .07, .1, true),
      });
    }

    if (deadTimePercentage > 0.2) {
      results.addIssue({
        issue: `Your dead GCD time can be improved. Try to Always Be Casting (ABC); when there's nothing to heal try to contribute some damage (${Math.round(deadTimePercentage * 100)}% dead GCD time).`,
        icon: 'spell_mage_altertime',
        importance: getIssueImportance(deadTimePercentage, 0.35, 0.4, true),
      });
    }
    // PtW uptime should be > 95%

    const castEfficiencyCategories = SPELL_CATEGORY;
    const castEfficiency = getCastEfficiency(CPM_ABILITIES, this);
    castEfficiency.forEach((cpm) => {
      if (cpm.canBeImproved && !cpm.ability.noSuggestion) {
        results.addIssue({
          issue: <span>Try to cast <SpellLink id={cpm.ability.spell.id} /> more often ({cpm.casts}/{cpm.maxCasts} casts: {Math.round(cpm.castEfficiency * 100)}% cast efficiency). {cpm.ability.extraSuggestion || ''}</span>,
          icon: cpm.ability.spell.icon,
          importance: cpm.ability.importance || getIssueImportance(cpm.castEfficiency, cpm.recommendedCastEfficiency - 0.05, cpm.recommendedCastEfficiency - 0.15),
        });
      }
    });

    results.statistics = [
      <StatisticBox
        icon={(
          <img
            src="/img/healing.png"
            style={{ border: 0 }}
            alt="Healing"
          />)}
        value={`${formatNumber(this.totalHealing / fightDuration * 1000)} HPS`}
        label={(
          <dfn data-tip={`The total healing done recorded was ${formatThousands(this.totalHealing)}.`}>
            Healing done
          </dfn>
        )}
      />,
      <StatisticBox
        icon={<Icon icon="petbattle_health-down" alt="Non healing time" />}
        value={`${formatPercentage(deadTimePercentage)} %`}
        label={(
          <dfn data-tip="Dead GCD time is available casting time not used. This can be caused by latency, cast interrupting, not casting anything (e.g. due to movement/stunned), etc.">
            Dead GCD time
          </dfn>
        )}
      />,
      this.modules.evangelism.active && (<ExpandableStatisticBox
        icon={<SpellIcon id={SPELLS.EVANGELISM_TALENT.id} />}
        value={`${formatNumber(this.modules.evangelism.evangelismStatistics.reduce((p, c) => p += c.healing, 0) / fightDuration * 1000)} HPS`}
        label={(
          <dfn data-tip={`Evangelism accounted for approximately ${ formatPercentage(this.modules.evangelism.evangelismStatistics.reduce((p, c) => p + c.healing, 0) / this.totalHealing) }% of your healing.`}>
            Evangelism contribution
          </dfn>
        )}
      >
        <table className="table table-condensed">
          <thead>
            <tr>
              <th>Cast</th>
              <th>Healing</th>
              <th>Duration</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {
              this.modules.evangelism.evangelismStatistics
                .map((evangelism, index) => (
                  <tr key={index}>
                    <th scope="row">{ index + 1 }</th>
                    <td>{ formatNumber(evangelism.healing) }</td>
                    <td>{ evangelism.atonementSeconds }s</td>
                    <td>{ evangelism.count }</td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </ExpandableStatisticBox>),
      missedPenanceTicks && (<StatisticBox
        icon={<SpellIcon id={SPELLS.PENANCE.id} />}
        value={missedPenanceTicks}
        label={(
          <dfn data-tip={`Each Penance cast has 3 bolts (4 if you're using Castigation). You should try to let this channel finish as much as possible. You channeled Penance ${this.modules.alwaysBeCasting.truePenanceCasts} times.`}>
            Wasted Penance bolts
          </dfn>
        )}
      />),
      this.modules.atonement.active && (
        <StatisticBox
          icon={<SpellIcon id={SPELLS.ATONEMENT_HEAL_NON_CRIT.id} />}
          value={this.modules.atonement.improperAtonementRefreshes.length}
          label={(
            <dfn data-tip={`The amount of Atonements that were refreshed earlier than within 3 seconds of the buff expiring. You applied Atonement ${this.modules.atonement.totalAtones} times in total, ${this.modules.atonement.totalAtonementRefreshes} (${((this.modules.atonement.totalAtonementRefreshes / this.modules.atonement.totalAtones * 100) || 0).toFixed(2)}%) of them were refreshes of existing Atonements, and ${this.modules.atonement.improperAtonementRefreshes.length} (${((this.modules.atonement.improperAtonementRefreshes.length / this.modules.atonement.totalAtones * 100) || 0).toFixed(2)}%) of them were considered early.` }>
              Early Atonement refreshes
            </dfn>
          )}
        />
      ),
      this.modules.twistOfFate.active && (
        <StatisticBox
          icon={<SpellIcon id={SPELLS.TWIST_OF_FATE_TALENT.id} />}
          value={`${formatNumber(this.modules.twistOfFate.healing / fightDuration * 1000)} HPS`}
          label={(
            <dfn data-tip={`The actual effective healing contributed by Twist of Fate (${formatPercentage(this.modules.twistOfFate.healing / this.totalHealing)}% of total healing done). Twist of Fate also contributed ${formatNumber(this.modules.twistOfFate.damage / fightDuration * 1000)} DPS (${formatPercentage(this.modules.twistOfFate.damage / this.totalDamage)}% of total damage done), the healing gain of this damage was included in the shown numbers.`}>
              Twist of Fate contribution
            </dfn>
          )}
        />
      ),
      this.selectedCombatant.hasTalent(SPELLS.PURGE_THE_WICKED_TALENT.id) && (
        <StatisticBox
          icon={<SpellIcon id={SPELLS.PURGE_THE_WICKED_BUFF.id} />}
          value={`${formatPercentage(this.modules.enemies.getBuffUptime(SPELLS.PURGE_THE_WICKED_BUFF.id) / this.fightDuration)} %`}
          label="Purge the Wicked uptime"
        />
      ),
      !this.selectedCombatant.hasTalent(SPELLS.PURGE_THE_WICKED_TALENT.id) && (
        <StatisticBox
          icon={<SpellIcon id={SPELLS.SHADOW_WORD_PAIN.id} />}
          value={`${formatPercentage(this.modules.enemies.getBuffUptime(SPELLS.SHADOW_WORD_PAIN.id) / this.fightDuration)} %`}
          label="Shadow Word: Pain uptime"
        />
      ),
      this.modules.powerWordShieldWasted.wasted && (
        <StatisticBox
          icon={<SpellIcon id={SPELLS.POWER_WORD_SHIELD.id} />}
          value={`${formatNumber(this.modules.powerWordShieldWasted.wasted / fightDuration * 1000)} HPS`}
          label={(
            <dfn data-tip={`The amount of shield absorb remaining on Power Word: Shields that expired. There was a total of ${formatNumber(this.modules.powerWordShieldWasted.wasted)} unused Power Word: Shield absorb from ${this.modules.powerWordShieldWasted.count} shields with absorb remaining (a total of ${this.modules.powerWordShieldWasted.totalCount} shields were applied).`}>
              Unused PW:S absorb
            </dfn>
          )}
        />),
    ];

    results.items = [
      ...results.items,
      this.modules.tarnishedSentinelMedallion.active && {
        item: ITEMS.TARNISHED_SENTINEL_MEDALLION,
        result: (
          <dfn data-tip="The atonement healing done by the trinket's damaging effects.">
            { ((owlHealingPercentage * 100) || 0).toFixed(2) } % / { formatNumber(this.modules.tarnishedSentinelMedallion.healing / fightDuration * 1000) } HPS
          </dfn>
        ),
      },
      this.modules.marchOfTheLegion.active && {
        item: SPELLS.MARCH_OF_THE_LEGION,
        result: (
          <dfn data-tip="The atonement healing done by the set bonus' damaging effects.">
            { ((marchHealingPercentage * 100) || 0).toFixed(2) } % / { formatNumber(this.modules.marchOfTheLegion.healing / fightDuration * 1000) } HPS
          </dfn>
        ),
      },
      this.modules.cordOfMaiev.active && {
        item: ITEMS.CORD_OF_MAIEV_PRIESTESS_OF_THE_MOON,
        result: (
          <span>
            {(this.modules.cordOfMaiev.procTime / 1000).toFixed(1)} seconds off the <SpellLink id={SPELLS.PENANCE.id} /> cooldown ({this.modules.cordOfMaiev.procs} Penances cast earlier)
          </span>
        ),
      },
      this.modules.skjoldr.active && {
        item: ITEMS.SKJOLDR_SANCTUARY_OF_IVAGONT,
        result: (
          <dfn data-tip="The actual effective healing contributed by the Skjoldr, Sanctuary of Ivagont equip effect. This includes the healing gained via Share in the Light.">
            {((this.modules.skjoldr.healing / this.totalHealing * 100) || 0).toFixed(2)} % / {formatNumber(this.modules.skjoldr.healing / fightDuration * 1000)} HPS
          </dfn>
        ),
      },
      this.modules.xalan.active && {
        item: ITEMS.XALAN_THE_FEAREDS_CLENCH,
        result: (
          <dfn data-tip={`The actual effective healing contributed by the Xalan the Feared's Clench equip effect asuming your Atonement lasts ${this.modules.xalan.atonementDuration} seconds normally.`}>
            {((this.modules.xalan.healing / this.totalHealing * 100) || 0).toFixed(2)} % / {formatNumber(this.modules.xalan.healing / fightDuration * 1000)} HPS
          </dfn>
        ),
      },
      this.modules.neroBandOfPromises.active && {
        item: ITEMS.NERO_BAND_OF_PROMISES,
        result: (
          <dfn data-tip={`The healing gain from Penance damage on players without without Atonement during the Power Word: Barrier buff.`}>
            {((this.modules.neroBandOfPromises.healing / this.totalHealing * 100) || 0).toFixed(2)} % / {formatNumber(this.modules.neroBandOfPromises.healing / fightDuration * 1000)} HPS
          </dfn>
        ),
      },
      this.modules.tier19_2set.active && {
        id: `spell-${SPELLS.DISC_PRIEST_T19_2SET_BONUS_BUFF.id}`,
        icon: <SpellIcon id={SPELLS.DISC_PRIEST_T19_2SET_BONUS_BUFF.id} />,
        title: <SpellLink id={SPELLS.DISC_PRIEST_T19_2SET_BONUS_BUFF.id} />,
        result: (
          <dfn data-tip="The actual effective healing contributed by the Tier 19 2 set bonus.">
            {((tier19_2setHealingPercentage * 100) || 0).toFixed(2)} % / {formatNumber(this.modules.tier19_2set.healing / fightDuration * 1000)} HPS
          </dfn>
        ),
      },
    ];

    results.tabs = [
      {
        title: 'Suggestions',
        url: 'suggestions',
        render: () => (
          <SuggestionsTab issues={results.issues} />
        ),
      },
      {
        title: 'Cast efficiency',
        url: 'cast-efficiency',
        render: () => (
          <CastEfficiencyTab
            categories={castEfficiencyCategories}
            abilities={castEfficiency}
          />
        ),
      },
      {
        title: 'Cooldowns',
        url: 'cooldowns',
        render: () => (
          <CooldownsTab
            fightStart={this.fight.start_time}
            fightEnd={this.fight.end_time}
            cooldowns={this.modules.cooldownTracker.pastCooldowns}
          />
        ),
      },
      {
        title: 'Talents',
        url: 'talents',
        render: () => (
          <TalentsTab combatant={this.selectedCombatant} />
        ),
      },
      {
        title: 'Mana',
        url: 'mana',
        render: () => (
          <ManaTab
            reportCode={this.report.code}
            actorId={this.playerId}
            start={this.fight.start_time}
            end={this.fight.end_time}
          />
        ),
      },
    ];

    return results;
  }
}

export default CombatLogParser;
