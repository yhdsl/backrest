import React, { useEffect, useState } from "react";
import {
  LogDataRequest,
  LogDataRequestSchema,
} from "../../gen/ts/v1/service_pb";
import { backrestService } from "../api";
import { Button } from "antd";
import { create } from "@bufbuild/protobuf";

// TODO: refactor this to use the provider pattern
export const LogView = ({ logref }: { logref: string }) => {
  const [lines, setLines] = useState<string[]>([""]);
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    if (!logref) {
      return;
    }

    const controller = new AbortController();

    (async () => {
      try {
        for await (const log of backrestService.getLogs(
          create(LogDataRequestSchema, {
            ref: logref,
          }),
          { signal: controller.signal }
        )) {
          const text = new TextDecoder("utf-8").decode(log.value);
          const lines = text.split("\n");
          setLines((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] += lines[0];
            copy.push(...lines.slice(1));
            return copy;
          });
        }
      } catch (e) {
        // setLines((prev) => [...prev, `Fetch log error: ${e}`]);
      }
    })();

    return () => {
      setLines([]);
      controller.abort();
    };
  }, [logref]);

  let displayLines = lines;
  if (lines.length > limit) {
    displayLines = lines.slice(0, limit);
  }

  return (
    <div
      style={{
        overflowX: "scroll",
        width: "100%",
      }}
    >
      {displayLines.map((line, i) => (
        <pre
          style={{ margin: "0px", whiteSpace: "pre", overflow: "visible" }}
          key={i}
        >
          {line}
        </pre>
      ))}
      {lines.length > limit ? (
        <>
          <Button
            color="default"
            type="link"
            onClick={() => setLimit(limit * 10)}
          >
            显示另外 {Math.min(limit * 9, lines.length - limit)} 行日志，共{" "}
            {lines.length} 行日志可用...
          </Button>
        </>
      ) : null}
    </div>
  );
};
