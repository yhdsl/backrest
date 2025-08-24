package repo

import (
	"bufio"
	"context"
	"io"

	"github.com/garethgeorge/backrest/internal/ioutil"
	"github.com/garethgeorge/backrest/internal/orchestrator/logging"
	"github.com/garethgeorge/backrest/pkg/restic"
)

// pipeResticLogsToWriter sets the restic logger to write to the provided writer.
// returns a new context with the logger set and a function to flush the logs.
func forwardResticLogs(ctx context.Context) (context.Context, func()) {
	if logging.WriterFromContext(ctx) == nil {
		return ctx, func() {}
	}
	logger := logging.Logger(ctx, "[restic] ")

	pr, pw := io.Pipe()

	go func() {
		scanner := bufio.NewScanner(pr)
		buf := make([]byte, 1024 * 1024)
		scanner.Buffer(buf, 1024 * 1024)
		for scanner.Scan() {
			logger.Sugar().Infof("%s", scanner.Text())
		}
		if err := scanner.Err(); err != nil {
			logger.Sugar().Errorf("Error reading restic logs: %v", err)
		}
		pr.Close()
	}()

	limitWriter := &ioutil.LimitWriter{W: pw, N: 1024 * 1024}
	return restic.ContextWithLogger(ctx, limitWriter), func() {
		if limitWriter.D > 0 {
			logger.Sugar().Warnf("... Output truncated, %d bytes dropped\n", limitWriter.D)
		}
		pw.Close()
	}
}
