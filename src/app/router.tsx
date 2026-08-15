import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { RouteError } from '@/components/common/RouteError';
import { LoadingScreen } from '@/components/common/LoadingScreen';

/**
 * Route table (DEVELOPMENT_INSTRUCTIONS §5).
 *
 * Every page is a lazy import, giving route-level code splitting (§29) so the initial
 * payload stays small and vocabulary bundles load only when a screen needs them.
 */

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const LearnPage = lazy(() => import('@/pages/LearnPage'));
const LevelPage = lazy(() => import('@/pages/LevelPage'));
const FrequencyBandPage = lazy(() => import('@/pages/FrequencyBandPage'));
const TopicPage = lazy(() => import('@/pages/TopicPage'));
const ContinuousPage = lazy(() => import('@/pages/ContinuousPage'));
const ReviewPage = lazy(() => import('@/pages/ReviewPage'));
const PracticePage = lazy(() => import('@/pages/PracticePage'));
const PracticeSessionPage = lazy(() => import('@/pages/PracticeSessionPage'));
const ResultsPage = lazy(() => import('@/pages/ResultsPage'));
const VocabularyBrowserPage = lazy(() => import('@/pages/VocabularyBrowserPage'));
const VocabularyEntryPage = lazy(() => import('@/pages/VocabularyEntryPage'));
const ProgressPage = lazy(() => import('@/pages/ProgressPage'));
const AchievementsPage = lazy(() => import('@/pages/AchievementsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const DataPage = lazy(() => import('@/pages/DataPage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function page(element: ReactNode): ReactNode {
  return <Suspense fallback={<LoadingScreen />}>{element}</Suspense>;
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: page(<DashboardPage />) },
      { path: 'learn', element: page(<LearnPage />) },
      { path: 'learn/:level', element: page(<LevelPage />) },
      { path: 'learn/:level/:frequencyBand', element: page(<FrequencyBandPage />) },
      { path: 'topic/:topicSlug', element: page(<TopicPage />) },
      { path: 'continuous/:sessionId', element: page(<ContinuousPage />) },
      { path: 'review', element: page(<ReviewPage />) },
      { path: 'practice', element: page(<PracticePage />) },
      { path: 'practice/session/:sessionId', element: page(<PracticeSessionPage />) },
      { path: 'results/:sessionId', element: page(<ResultsPage />) },
      { path: 'vocabulary', element: page(<VocabularyBrowserPage />) },
      { path: 'word/:entryId', element: page(<VocabularyEntryPage />) },
      { path: 'progress', element: page(<ProgressPage />) },
      { path: 'achievements', element: page(<AchievementsPage />) },
      { path: 'settings', element: page(<SettingsPage />) },
      { path: 'data', element: page(<DataPage />) },
      { path: 'about', element: page(<AboutPage />) },
      { path: '*', element: page(<NotFoundPage />) },
    ],
  },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
