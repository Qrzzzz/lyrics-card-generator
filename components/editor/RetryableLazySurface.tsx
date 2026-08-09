"use client";

import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode
} from "react";

export type DeferredComponentLoader<Props extends object> = () => Promise<{
  default: ComponentType<Props>;
}>;

type RetryableLazySurfaceProps<Props extends object> = {
  loadComponent: DeferredComponentLoader<Props>;
  componentProps: Props;
  fallback: ReactNode;
  renderError: (error: unknown, retry: () => void) => ReactNode;
};

type LazySurfaceErrorBoundaryProps = {
  children: ReactNode;
  renderError: (error: unknown) => ReactNode;
};

type LazySurfaceErrorBoundaryState = {
  error: unknown;
  hasError: boolean;
};

class LazySurfaceErrorBoundary extends Component<
  LazySurfaceErrorBoundaryProps,
  LazySurfaceErrorBoundaryState
> {
  state: LazySurfaceErrorBoundaryState = {
    error: null,
    hasError: false
  };

  componentDidCatch(error: unknown) {
    this.setState({ error, hasError: true });
  }

  render() {
    if (this.state.hasError) return this.props.renderError(this.state.error);
    return this.props.children;
  }
}

/**
 * Gives one delayed surface its own failure boundary. A retry increments the
 * generation outside that boundary, creating a fresh React.lazy instance so a
 * rejected loader promise is never reused by React.
 */
export function RetryableLazySurface<Props extends object>({
  loadComponent,
  componentProps,
  fallback,
  renderError
}: RetryableLazySurfaceProps<Props>) {
  const [generation, setGeneration] = useState(0);
  const LazyComponent = useMemo(
    () => lazy(loadComponent),
    [generation, loadComponent]
  );
  const retry = useCallback(() => setGeneration((current) => current + 1), []);

  return (
    <LazySurfaceErrorBoundary
      key={generation}
      renderError={(error) => renderError(error, retry)}
    >
      <Suspense fallback={fallback}>
        <LazyComponent {...componentProps} />
      </Suspense>
    </LazySurfaceErrorBoundary>
  );
}
