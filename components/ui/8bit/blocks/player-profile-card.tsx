import React from "react";

import { cn } from "@/lib/utils";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/8bit/avatar";
import { Badge } from "@/components/ui/8bit/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/8bit/card";
import HealthBar from "@/components/ui/8bit/health-bar";
import ManaBar from "@/components/ui/8bit/mana-bar";
import { Progress } from "@/components/ui/8bit/progress";
import "@/components/ui/8bit/styles/retro.css";

export interface PlayerStats {
  health?: {
    current: number;
    max: number;
  };
  mana?: {
    current: number;
    max: number;
  };
  experience?: {
    current: number;
    max: number;
  };
  level?: number;
  [key: string]: unknown; // Allow custom stats
}

export interface PlayerProfileCardProps {
  className?: string;
  /** Adaptation: a row below the name — e.g. the achievement row. */
  belowName?: React.ReactNode;
  playerName: string;
  avatarSrc?: string;
  avatarFallback?: string;
  level?: number;
  stats?: PlayerStats;
  playerClass?: string;
  /** Adaptation: badge content instead of "Lv.{level}" — e.g. "#3" from the leaderboard. */
  badge?: React.ReactNode;
  /** Adaptation: badge variant — top-3 uses outline so the trophy stays readable. */
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  /** Adaptation: extra badge classes — e.g. the top-3 trophy color. */
  badgeClassName?: string;
  showLevel?: boolean;
  showHealth?: boolean;
  showMana?: boolean;
  showExperience?: boolean;
  customStats?: Array<{
    label: string;
    value: number;
    max?: number;
    color?: string;
    variant?: "retro" | "default";
  }>;
}

export default function PlayerProfileCard({
  className,
  belowName,
  playerName,
  avatarSrc,
  avatarFallback,
  level = 1,
  stats,
  playerClass,
  badge,
  badgeVariant = "default",
  badgeClassName,
  showLevel = true,
  showHealth = true,
  showMana = true,
  showExperience = true,
  customStats = [],
  ...props
}: PlayerProfileCardProps) {
  const healthPercentage = stats?.health
    ? Math.round((stats.health.current / stats.health.max) * 100)
    : 0;

  const manaPercentage = stats?.mana
    ? Math.round((stats.mana.current / stats.mana.max) * 100)
    : 0;

  const experiencePercentage = stats?.experience
    ? Math.round((stats.experience.current / stats.experience.max) * 100)
    : 0;

  // Adaptation: with no enabled bars, CardContent is not rendered at all —
  // otherwise the empty block would leave extra spacing under the header.
  const hasBars =
    (showHealth && stats?.health) ||
    (showMana && stats?.mana) ||
    (showExperience && stats?.experience) ||
    customStats.length > 0;

  return (
    // Adapted per spec § 6.7.1: font="normal" on the card — the "class" caption
    // is read in regular sans; pixel goes to the name heading and level badge.
    <Card font="normal" className={cn("w-full max-w-md", className)} {...props}>
      {/* Adaptation: the header's bottom padding is only needed before the bars. */}
      <CardHeader className={hasBars ? "pb-4" : "pb-0"}>
        <div className="flex items-center gap-4">
          <Avatar className="size-16" variant="pixel" font="retro">
            <AvatarImage src={avatarSrc} alt={playerName} />
            <AvatarFallback className="text-lg">
              {avatarFallback || playerName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="space-y-1">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2 justify-between">
                {/* Name is the card heading, pixel is allowed (spec § 6.7.1);
                    font-pixel is loaded with a Cyrillic subset. */}
                <h3 className="font-pixel text-sm leading-relaxed truncate">{playerName}</h3>
                {showLevel && (
                  <span>
                    {/* Adaptation: geometry and font size match StreakBadge in
                        the leaderboard, so badges across the project look alike. */}
                    <Badge
                      variant={badgeVariant}
                      className={cn(
                        "mx-1.5 min-h-7 align-middle text-[16px]",
                        badgeClassName
                      )}
                    >
                      {badge ?? `Lv.${level}`}
                    </Badge>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {playerClass && (
                  <span className="text-xs text-muted-foreground">
                    {playerClass}
                  </span>
                )}
              </div>
              {/* Adaptation: the row below the name — achievements etc. */}
              {belowName}
            </div>
          </div>
        </div>
      </CardHeader>

      {hasBars && (
      <CardContent className="space-y-4">
        {/* Health Bar */}
        {showHealth && stats?.health && (
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Health</span>
              <span className="text-[9px] sm:text-xs text-muted-foreground retro">
                {stats.health.current}/{stats.health.max}
              </span>
            </div>
            <HealthBar
              value={healthPercentage}
              variant="retro"
              className="h-3"
            />
          </div>
        )}

        {/* Mana Bar */}
        {showMana && stats?.mana && (
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Mana</span>
              <span className="text-[9px] sm:text-xs text-muted-foreground retro">
                {stats.mana.current}/{stats.mana.max}
              </span>
            </div>
            <ManaBar value={manaPercentage} variant="retro" className="h-3" />
          </div>
        )}

        {/* Experience Bar */}
        {showExperience && stats?.experience && (
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Experience</span>
              <span className="text-[9px] sm:text-xs text-muted-foreground retro">
                {stats.experience.current}/{stats.experience.max} XP
              </span>
            </div>
            <Progress
              value={experiencePercentage}
              variant="retro"
              progressBg="bg-yellow-500"
              className="h-3"
            />
          </div>
        )}

        {/* Custom Stats */}
        {customStats.length > 0 && (
          <div className="space-y-2">
            {customStats.map((stat, index) => {
              const percentage = stat.max
                ? Math.round((stat.value / stat.max) * 100)
                : 0;

              return (
                <div key={index} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">{stat.label}</span>
                    <span className="text-[9px] sm:text-xs text-muted-foreground retro">
                      {stat.value}
                      {stat.max ? `/${stat.max}` : ""}
                    </span>
                  </div>
                  <Progress
                    value={percentage}
                    variant={stat.variant || "retro"}
                    progressBg={stat.color || "bg-primary"}
                    className="h-3"
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      )}
    </Card>
  );
}
