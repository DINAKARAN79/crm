"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DynamicForm } from "@/components/dynamic/dynamic-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { objectManagerApi, dynamicRecordApi } from "@/lib/api";
import { FieldDefinition } from "@/components/dynamic/field-renderer";

interface ObjectMetadata {
  id: string;
  name: string;
  label: string;
  pluralLabel: string;
  icon?: string;
  objectType: string;
  fields: FieldDefinition[];
  layouts: any[];
}

export default function ObjectCreatePage() {
  const params = useParams();
  const router = useRouter();
  const objectName = params.objectName as string;

  const [metadata, setMetadata] = React.useState<ObjectMetadata | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    loadMetadata();
  }, [objectName]);

  const loadMetadata = async () => {
    setIsLoading(true);
    try {
      const res = await objectManagerApi.getObject(objectName);
      setMetadata(res.data.data);
    } catch (error) {
      console.error("Failed to load object metadata:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (data: Record<string, any>) => {
    await dynamicRecordApi.create(objectName, data);
    router.push(`/objects/${objectName}`);
  };

  if (isLoading || !metadata) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-96 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/objects/${objectName}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Create {metadata.label}</h1>
          <p className="text-muted-foreground">
            Add a new {metadata.label.toLowerCase()}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New {metadata.label}</CardTitle>
        </CardHeader>
        <CardContent>
          <DynamicForm
            fields={metadata.fields}
            layout={metadata.layouts?.[0]}
            onSubmit={handleSubmit}
            onCancel={() => router.push(`/objects/${objectName}`)}
            title={`Create ${metadata.label}`}
            submitLabel={`Create ${metadata.label}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}