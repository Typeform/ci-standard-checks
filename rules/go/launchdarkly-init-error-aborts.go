package featureflags

import (
	"context"
	"fmt"
	"log"
	"os"

	ld "github.com/launchdarkly/go-server-sdk/v7"
	ldclient "github.com/launchdarkly/go-server-sdk/v7"
)

// Returning the error up the stack (user-service, workspace-service before the fix).
func newReturning(key string, cfg ld.Config) (*ld.LDClient, error) {
	client, err := ld.MakeCustomClient(key, cfg, 5)
	// ruleid: launchdarkly-init-error-aborts
	if err != nil {
		return nil, fmt.Errorf("launchdarkly: %w", err)
	}
	return client, nil
}

func newPanicking(key string) *ld.LDClient {
	ldClient, err := ldclient.MakeClient(key, 5)
	// ruleid: launchdarkly-init-error-aborts
	if err != nil {
		panic(fmt.Errorf("initialize LaunchDarkly client: %w", err))
	}
	return ldClient
}

func newFatal(key string) *ld.LDClient {
	var client *ld.LDClient
	var err error
	client, err = ld.MakeClient(key, 5)
	// ruleid: launchdarkly-init-error-aborts
	if err != nil {
		log.Fatalf("launchdarkly: %v", err)
	}
	return client
}

func newExit(key string) *ld.LDClient {
	client, err := ld.MakeClient(key, 5)
	// ruleid: launchdarkly-init-error-aborts
	if err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
	return client
}

// Typeform xlog fatal level (webhooks-api style).
func newXlogFatal(ctx context.Context, logger Logger, key string) *ld.LDClient {
	client, err := ld.MakeClient(key, 5)
	// ruleid: launchdarkly-init-error-aborts
	if err != nil {
		logger.Log(ctx, xlog.LevelFatal, "launchdarkly", "error", err)
		return nil
	}
	return client
}

// The fixed shape: abort only on a nil client, warn otherwise.
func newFixed(ctx context.Context, logger Logger, key string, cfg ld.Config) (*ld.LDClient, error) {
	client, err := ld.MakeCustomClient(key, cfg, 5)
	// ok: launchdarkly-init-error-aborts
	if client == nil {
		return nil, fmt.Errorf("launchdarkly: %w", err)
	}
	// ok: launchdarkly-init-error-aborts
	if err != nil {
		logger.Log(ctx, xlog.LevelWarn, "LaunchDarkly client not initialized, serving flag defaults", "error", err)
	}
	return client, nil
}

// Already lenient: logs and carries on.
func newWarnOnly(key string) *ld.LDClient {
	client, err := ld.MakeClient(key, 5)
	// ok: launchdarkly-init-error-aborts
	if err != nil {
		log.Printf("WARN launchdarkly not initialized, serving defaults: %v", err)
	}
	return client
}

// Unrelated constructors are not LaunchDarkly clients.
func newOther(key string) (*Other, error) {
	other, err := otherpkg.MakeThing(key)
	// ok: launchdarkly-init-error-aborts
	if err != nil {
		return nil, err
	}
	return other, nil
}
